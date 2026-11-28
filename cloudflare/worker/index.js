/**
 * Menarat Al Haouz API — Cloudflare Worker + D1
 * Deploy only to a staging Worker with a NEW D1 database.
 * Required bindings: DB (D1), APP_ORIGIN (Text), BOOTSTRAP_SECRET (Secret).
 * No Firebase data is read, changed, or deleted by this Worker.
 */
const COOKIE = "__Host-menarat_session";
const SESSION_DAYS = 7;
const ITERATIONS = 100000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = env.APP_ORIGIN;
  if (!origin || !allowed || origin !== allowed) return {};
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "vary": "Origin"
  };
}
function cookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function randomHex(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return [...data].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function sha256(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function passwordHash(password, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations }, key, 256);
  return [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function body(request) {
  const declaredSize = Number(request.headers.get("Content-Length") || 0);
  if (declaredSize > 65536) throw new Error("Request body too large");
  const raw = await request.text();
  if (raw.length > 65536) throw new Error("Request body too large");
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("Invalid JSON body"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid JSON body");
  return value;
}
function clean(value, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 190;
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function sameOrigin(request, env) {
  return request.headers.get("Origin") === env.APP_ORIGIN && !!env.APP_ORIGIN;
}
async function loginThrottleKey(request, email) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  return sha256(ip + ":" + email);
}
async function isLoginBlocked(request, email, env) {
  const key = await loginThrottleKey(request, email);
  const row = await env.DB.prepare("SELECT blocked_until FROM login_attempts WHERE identifier_hash=?").bind(key).first();
  return Number(row?.blocked_until || 0) > Date.now();
}
async function recordLoginFailure(request, email, env) {
  const key = await loginThrottleKey(request, email);
  const now = Date.now();
  const row = await env.DB.prepare("SELECT attempts,window_started_at FROM login_attempts WHERE identifier_hash=?").bind(key).first();
  if (!row || now - Number(row.window_started_at) > 15 * 60 * 1000) {
    await env.DB.prepare("INSERT INTO login_attempts(identifier_hash,attempts,window_started_at,blocked_until) VALUES(?,1,?,0) ON CONFLICT(identifier_hash) DO UPDATE SET attempts=1,window_started_at=excluded.window_started_at,blocked_until=0")
      .bind(key, now).run();
    return;
  }
  const attempts = Number(row.attempts || 0) + 1;
  const blockedUntil = attempts >= 8 ? now + 15 * 60 * 1000 : 0;
  await env.DB.prepare("UPDATE login_attempts SET attempts=?,blocked_until=? WHERE identifier_hash=?")
    .bind(attempts, blockedUntil, key).run();
}
async function clearLoginFailures(request, email, env) {
  const key = await loginThrottleKey(request, email);
  await env.DB.prepare("DELETE FROM login_attempts WHERE identifier_hash=?").bind(key).run();
}
async function getUser(request, env) {
  const raw = (request.headers.get("Cookie") || "").split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  if (!raw) return null;
  const token = raw.slice(COOKIE.length + 1);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare(`
    SELECT u.id,u.email,u.display_name,u.role,u.active
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at > datetime('now') AND u.active=1
  `).bind(await sha256(token)).first();
}
function requireAdmin(user) { return user && user.role === "admin"; }
async function createSession(userId, env) {
  const token = randomHex();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)")
    .bind(crypto.randomUUID(), userId, await sha256(token), expires).run();
  return token;
}
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });

  if (path === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "menarat-api", database: !!env.DB });
  }

  if (path === "/api/setup-admin" && request.method === "POST") {
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" }, 403);
    if (!env.BOOTSTRAP_SECRET) return json({ error: "Bootstrap is not configured" }, 503);
    const data = await body(request);
    if (!data.secret || data.secret !== env.BOOTSTRAP_SECRET) return json({ error: "Forbidden" }, 403);
    const email = clean(data.email, 190).toLowerCase();
    const name = clean(data.displayName || "ADMIN", 100);
    const password = typeof data.password === "string" ? data.password : "";
    if (!validEmail(email) || password.length < 12 || password.length > 200) {
      return json({ error: "Provide a valid email and a password of at least 12 characters" }, 400);
    }
    const salt = randomHex(16);
    const hash = await passwordHash(password, salt);
    const created = await env.DB.prepare(`
      INSERT INTO users(id,email,display_name,role,password_hash,password_salt,password_iterations)
      SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM users)
    `).bind(crypto.randomUUID(), email, name, "admin", hash, salt, ITERATIONS).run();
    if (Number(created.meta?.changes || 0) !== 1) return json({ error: "Initial setup already completed" }, 409);
    return json({ ok: true, message: "Initial administrator created. Remove/rotate bootstrap secret now." }, 201);
  }

  if (path === "/api/login" && request.method === "POST") {
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" }, 403);
    const data = await body(request);
    const email = clean(data.email, 190).toLowerCase();
    const password = typeof data.password === "string" ? data.password : "";
    if (!validEmail(email) || !password || password.length > 200) return json({ error: "Invalid credentials" }, 401);
    if (await isLoginBlocked(request, email, env)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
    const user = await env.DB.prepare("SELECT * FROM users WHERE email=? AND active=1").bind(email).first();
    const candidate = await passwordHash(password, user?.password_salt || "menarat-invalid-user-salt", Number(user?.password_iterations || ITERATIONS));
    if (!user || candidate !== user.password_hash) {
      await recordLoginFailure(request, email, env);
      return json({ error: "Invalid credentials" }, 401);
    }
    await clearLoginFailures(request, email, env);
    const token = await createSession(user.id, env);
    return json({ ok: true, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } }, 200, {
      "set-cookie": cookie(token, SESSION_DAYS * 86400)
    });
  }

  if (path === "/api/logout" && request.method === "POST") {
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" }, 403);
    const raw = (request.headers.get("Cookie") || "").split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
    if (raw) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(raw.slice(COOKIE.length + 1))).run();
    return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
  }

  const user = await getUser(request, env);
  if (path === "/api/me" && request.method === "GET") {
    if (!user) return json({ user: null }, 401);
    return json({ user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } });
  }
  if (!user) return json({ error: "Authentication required" }, 401);

  if (path === "/api/backup" && request.method === "GET") {
    if (!requireAdmin(user)) return json({ error: "Admin permission required" }, 403);
    const names = ["products","employees","zones","suppliers","invoices","invoice_lines","customers","expenses","debts","debt_payments","cash_transactions"];
    const tables = {};
    for (const name of names) {
      const result = await env.DB.prepare("SELECT * FROM " + name).all();
      tables[name] = result.results || [];
    }
    return json({
      format: "menarat-cloudflare-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      note: "Operational data only. Login accounts and sessions are intentionally excluded.",
      tables
    });
  }

  if (path === "/api/state" && request.method === "GET") {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS debts (id TEXT PRIMARY KEY, type TEXT NOT NULL, person TEXT NOT NULL, total_amount REAL NOT NULL, paid_amount REAL NOT NULL DEFAULT 0, due_date TEXT, notes TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), active INTEGER NOT NULL DEFAULT 1)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS debt_payments (id TEXT PRIMARY KEY, debt_id TEXT NOT NULL, amount REAL NOT NULL, payment_date TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, expense_date TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', amount REAL NOT NULL CHECK(amount > 0), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), active INTEGER NOT NULL DEFAULT 1)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS cash_transactions (id TEXT PRIMARY KEY, movement_type TEXT NOT NULL CHECK(movement_type IN ('opening','income','expense')), movement_date TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', amount REAL NOT NULL CHECK(amount > 0), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), active INTEGER NOT NULL DEFAULT 1)").run();
    try { await env.DB.prepare("ALTER TABLE invoices ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''").run(); }
    catch (error) { if (!/duplicate column/i.test(String(error?.message || error))) throw error; }
    try { await env.DB.prepare("ALTER TABLE invoices ADD COLUMN deleted_at TEXT").run(); }
    catch (error) { if (!/duplicate column/i.test(String(error?.message || error))) throw error; }
    const [products, employees, zones, customers, suppliers, expenses, debts, invoices] = await Promise.all([
      env.DB.prepare("SELECT id, name AS nom, unit AS unite, price AS prix, opening_stock AS stockInitial, current_stock AS stock, supplier_name AS fournisseur FROM products WHERE active=1 ORDER BY name").all(),
      env.DB.prepare("SELECT id, name FROM employees WHERE active=1 ORDER BY name").all(),
      env.DB.prepare("SELECT id, name FROM zones WHERE active=1 ORDER BY name").all(),
      env.DB.prepare("SELECT id, name, phone, address, notes FROM customers WHERE active=1 ORDER BY name").all(),
      env.DB.prepare("SELECT id, name AS nom, phone AS tel FROM suppliers WHERE active=1 ORDER BY name").all(),
      env.DB.prepare("SELECT id,expense_date AS date,category,description,amount,created_by FROM expenses WHERE active=1 ORDER BY expense_date DESC,created_at DESC").all(),
      env.DB.prepare("SELECT d.*, COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id=d.id),0) AS payments_total FROM debts d WHERE d.active=1 ORDER BY d.created_at DESC").all(),
      env.DB.prepare("SELECT i.*, l.id AS line_id, l.product_name AS produit,l.unit AS unite,l.quantity AS quantite,l.unit_price AS prix,l.line_total AS total FROM invoices i LEFT JOIN invoice_lines l ON l.invoice_id=i.id WHERE i.deleted_at IS NULL AND (? = 'admin' OR i.employee_user_id = ?) ORDER BY i.operation_date DESC").bind(user.role, user.id).all()
    ]);
    const cashTransactions = await env.DB.prepare("SELECT id,movement_type AS type,movement_date AS date,category,description,amount,created_by FROM cash_transactions WHERE active=1 ORDER BY movement_date DESC,created_at DESC").all();
    const operations = (invoices.results || []).filter(row => row.produit).map(row => ({
      id: row.line_id, factureId: row.id, invoiceRef: row.invoice_ref, date: row.operation_date, type: row.type,
      employe: row.employee_name, fournisseur: row.supplier_name, zone: row.zone_name, customer: row.customer_name || "",
      paiement: row.payment_status, produit: row.produit, unite: row.unite,
      quantite: row.quantite, prix: row.prix, total: row.total
    }));
    return json({
      user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role },
      produits: products.results || [], employes: employees.results || [],
      zones: zones.results || [], fournisseurs: suppliers.results || [], customers: customers.results || [],
      operations, expenses: expenses.results || [], debts: debts.results || [], cashTransactions: cashTransactions.results || [], panier: []
    });
  }

  if (path === "/api/expenses" && request.method === "POST") {
    if (!requireAdmin(user)) return json({ error: "Admin permission required" }, 403);
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" }, 403);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, expense_date TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', amount REAL NOT NULL CHECK(amount > 0), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), active INTEGER NOT NULL DEFAULT 1)").run();
    const data = await body(request);
    const date = clean(data.date,10), category = clean(data.category,80), description = clean(data.description,240), amount = Number(data.amount);
    if (!validDate(date) || !category || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) return json({ error: "تأكد من التاريخ والتصنيف والمبلغ" },400);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO expenses(id,expense_date,category,description,amount,created_by) VALUES(?,?,?,?,?,?)").bind(id,date,category,description,amount,user.display_name).run();
    return json({ ok:true,id },201);
  }
  if (path.startsWith("/api/expenses/") && request.method === "DELETE") {
    if (!requireAdmin(user)) return json({ error: "Admin permission required" },403);
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" },403);
    const id = path.split("/").filter(Boolean)[2] || "";
    const result = await env.DB.prepare("UPDATE expenses SET active=0 WHERE id=? AND active=1").bind(id).run();
    return Number(result.meta?.changes||0)===1 ? json({ok:true}) : json({error:"المصروف غير موجود"},404);
  }

  if (path === "/api/debts" && request.method === "POST") {
    if (!requireAdmin(user)) return json({ error: "Admin permission required" }, 403);
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" }, 403);
    const data = await body(request);
    const type = data.type === "payable" ? "payable" : data.type === "receivable" ? "receivable" : "";
    const person = clean(data.person, 140), total = Number(data.total), paid = Number(data.paid || 0);
    const dueDate = clean(data.dueDate || "", 10), notes = clean(data.notes || "", 500);
    if (!type || !person || !Number.isFinite(total) || total <= 0 || total > 100000000 || !Number.isFinite(paid) || paid < 0 || paid > total || (dueDate && !validDate(dueDate))) return json({ error: "تأكد من نوع الدين والاسم والمبالغ والتاريخ" }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO debts(id,type,person,total_amount,paid_amount,due_date,notes,created_by) VALUES(?,?,?,?,?,?,?,?)").bind(id,type,person,total,paid,dueDate,notes,user.display_name).run();
    if (paid > 0) await env.DB.prepare("INSERT INTO debt_payments(id,debt_id,amount,payment_date,note,created_by) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),id,paid,new Date().toISOString().slice(0,10),"دفعة أولية",user.display_name).run();
    return json({ ok: true, id }, 201);
  }
  if (path.startsWith("/api/debts/") && path.endsWith("/payment") && request.method === "POST") {
    if (!requireAdmin(user)) return json({ error: "Admin permission required" }, 403);
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" }, 403);
    const id = path.split("/").filter(Boolean)[2] || "";
    const data = await body(request), amount = Number(data.amount), date = clean(data.date, 10), note = clean(data.note || "", 240);
    if (!Number.isFinite(amount) || amount <= 0 || !validDate(date)) return json({ error: "تأكد من مبلغ وتاريخ الأداء" }, 400);
    const debt = await env.DB.prepare("SELECT total_amount,paid_amount FROM debts WHERE id=? AND active=1").bind(id).first();
    if (!debt) return json({ error: "الدين غير موجود" }, 404);
    if (amount > Number(debt.total_amount)-Number(debt.paid_amount)) return json({ error: "مبلغ الأداء أكبر من المبلغ المتبقي" }, 400);
    const result = await env.DB.prepare("UPDATE debts SET paid_amount=paid_amount+? WHERE id=? AND active=1 AND paid_amount=?").bind(amount,id,debt.paid_amount).run();
    if (Number(result.meta?.changes || 0) !== 1) return json({ error: "تغيرت بيانات الدين، أعد المحاولة" }, 409);
    await env.DB.prepare("INSERT INTO debt_payments(id,debt_id,amount,payment_date,note,created_by) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),id,amount,date,note,user.display_name).run();
    return json({ ok: true });
  }
  if (path.startsWith("/api/debts/") && request.method === "DELETE") {
    if (!requireAdmin(user)) return json({ error: "Admin permission required" }, 403);
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" }, 403);
    const id = path.split("/").filter(Boolean)[2] || "";
    const result = await env.DB.prepare("UPDATE debts SET active=0 WHERE id=? AND active=1").bind(id).run();
    return Number(result.meta?.changes || 0) === 1 ? json({ ok: true }) : json({ error: "الدين غير موجود" }, 404);
  }
  if (path.startsWith("/api/invoices/") && request.method === "DELETE") {
    if (!requireAdmin(user)) return json({ error: "Admin permission required" }, 403);
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" }, 403);
    const id = path.split("/").filter(Boolean)[2] || "";
    if (!id) return json({ error: "رقم العملية غير صحيح" }, 400);
    const invoice = await env.DB.prepare("SELECT id,type FROM invoices WHERE id=? AND deleted_at IS NULL").bind(id).first();
    if (!invoice) return json({ error: "العملية غير موجودة أو سبق حذفها" }, 404);
    const lines = await env.DB.prepare("SELECT product_name,quantity FROM invoice_lines WHERE invoice_id=?").bind(id).all();
    if (!lines.results?.length) return json({ error: "لا توجد تفاصيل لهذه العملية" }, 400);
    const totals = new Map();
    for (const line of lines.results) {
      const name = String(line.product_name || "");
      const quantity = Number(line.quantity);
      if (!name || !Number.isFinite(quantity) || quantity <= 0) return json({ error: "تفاصيل العملية غير صالحة" }, 409);
      totals.set(name, (totals.get(name) || 0) + quantity);
    }
    if (invoice.type === "achat") {
      for (const [name, quantity] of totals) {
        const product = await env.DB.prepare("SELECT current_stock FROM products WHERE name=?").bind(name).first();
        if (!product || Number(product.current_stock) < quantity) {
          return json({ error: "لا يمكن حذف عملية الشراء: المخزون الحالي لا يكفي لخصم الكمية التي دخلت بها" }, 409);
        }
      }
    }
    const deletedAt = new Date().toISOString();
    const statements = [
      env.DB.prepare("UPDATE invoices SET deleted_at=? WHERE id=? AND deleted_at IS NULL").bind(deletedAt,id)
    ];
    for (const [name, quantity] of totals) {
      statements.push(invoice.type === "vente"
        ? env.DB.prepare("UPDATE products SET current_stock=current_stock+? WHERE name=? AND EXISTS (SELECT 1 FROM invoices WHERE id=? AND deleted_at=?)").bind(quantity,name,id,deletedAt)
        : env.DB.prepare("UPDATE products SET current_stock=current_stock-? WHERE name=? AND current_stock>=? AND EXISTS (SELECT 1 FROM invoices WHERE id=? AND deleted_at=?)").bind(quantity,name,quantity,id,deletedAt));
    }
    const results = await env.DB.batch(statements);
    if (Number(results?.[0]?.meta?.changes || 0) !== 1) return json({ error: "تعذر حذف العملية، ربما تم حذفها من قبل" }, 409);
    return json({ ok: true, restoredStock: invoice.type === "vente", adjustedProducts: totals.size });
  }

  if (path === "/api/sales" && request.method === "POST") {
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" }, 403);
    const data = await body(request);
    const type = data.type === "achat" ? "achat" : data.type === "vente" ? "vente" : "";
    if (!type || (type === "achat" && user.role !== "admin")) return json({ error: "Operation not permitted" }, 403);
    const date = clean(data.date, 10);
    if (!validDate(date) || !Array.isArray(data.lines) || data.lines.length < 1 || data.lines.length > 100) {
      return json({ error: "Invalid invoice data" }, 400);
    }
    const zone = type === "vente" ? clean(data.zone, 120) : "MAGASIN";
    if (type === "vente" && !zone) return json({ error: "Zone is required" }, 400);
    const supplier = type === "achat" ? clean(data.supplier, 120) : "";
    if (type === "achat" && !supplier) return json({ error: "Supplier is required" }, 400);
    const customerId = type === "vente" ? clean(data.customerId || "", 80) : "";
    let customerName = "";
    if (customerId) {
      const customer = await env.DB.prepare("SELECT name FROM customers WHERE id=? AND active=1").bind(customerId).first();
      if (!customer) return json({ error: "الزبون المحدد غير موجود" }, 400);
      customerName = customer.name;
    }
    const employeeName = type === "vente"
      ? (user.role === "employe" ? user.display_name : clean(data.employeeName || user.display_name, 120))
      : supplier;
    let employeeUserId = type === "vente" ? user.id : null;
    if (type === "vente" && user.role === "admin" && data.employeeName && employeeName !== user.display_name) {
      const employee = await env.DB.prepare("SELECT name,user_id FROM employees WHERE name=? AND active=1").bind(employeeName).first();
      if (!employee || !employee.user_id) return json({ error: "Unknown employee or employee account is not linked" }, 400);
      employeeUserId = employee.user_id;
    }
    const aggregated = new Map();
    for (const line of data.lines) {
      const name = clean(line.product, 120), quantity = Number(line.quantity);
      if (!name || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return json({ error: "Invalid invoice line" }, 400);
      const key = name.toLocaleLowerCase("en");
      aggregated.set(key, (aggregated.get(key) || 0) + quantity);
    }
    const names = [...aggregated.keys()];
    const marks = names.map(() => "?").join(",");
    const found = await env.DB.prepare(`SELECT name,unit,price,current_stock FROM products WHERE active=1 AND name IN (${marks})`).bind(...names).all();
    const productMap = new Map((found.results || []).map(p => [p.name.toLocaleLowerCase("en"), p]));
    if (productMap.size !== names.length) return json({ error: "One or more products do not exist" }, 400);
    const lines = [];
    for (const line of data.lines) {
      const name = clean(line.product, 120), product = productMap.get(name.toLocaleLowerCase("en")), quantity = Number(line.quantity);
      const price = type === "vente" ? Number(product.price) : Number(line.price);
      const total = quantity * price;
      if (!Number.isFinite(price) || price < 0 || !Number.isFinite(total)) return json({ error: "Invalid unit price or line total" }, 400);
      lines.push({ name, unit: product.unit || "", quantity, price, total });
    }
    const invoiceId = crypto.randomUUID();
    const invoiceRef = clean(data.invoiceRef || ("FAC-" + Date.now()), 80);
    const payment = type === "vente" ? clean(data.payment || "Payé", 30) : "-";
    const statements = [];
    const shortageParts = names.map(() => "(name=? AND current_stock < ?)");
    const shortageArgs = [];
    for (const [name, qty] of aggregated) shortageArgs.push(name, qty);
    const stockCondition = type === "vente"
      ? ` AND NOT EXISTS (SELECT 1 FROM products WHERE ${shortageParts.join(" OR ")})`
      : "";
    statements.push(env.DB.prepare(`INSERT INTO invoices(id,invoice_ref,type,operation_date,month_key,employee_name,employee_user_id,supplier_name,zone_name,payment_status,created_at_ms,customer_name)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE 1=1${stockCondition}`).bind(
        invoiceId, invoiceRef, type, date, date.slice(0,7), employeeName, employeeUserId, supplier, zone, payment, Date.now(), customerName, ...shortageArgs
      ));
    for (const [name, qty] of aggregated) {
      statements.push(type === "vente"
        ? env.DB.prepare("UPDATE products SET current_stock=current_stock-? WHERE name=? AND EXISTS (SELECT 1 FROM invoices WHERE id=?)").bind(qty,name,invoiceId)
        : env.DB.prepare("UPDATE products SET current_stock=current_stock+? WHERE name=? AND EXISTS (SELECT 1 FROM invoices WHERE id=?)").bind(qty,name,invoiceId));
    }
    for (const line of lines) {
      statements.push(env.DB.prepare(`INSERT INTO invoice_lines(id,invoice_id,product_name,unit,quantity,unit_price,line_total)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM invoices WHERE id=?)`).bind(
          crypto.randomUUID(), invoiceId, line.name, line.unit, line.quantity, line.price, line.total, invoiceId
        ));
    }
    const results = await env.DB.batch(statements);
    const invoiceCreated = Number(results?.[0]?.meta?.changes || 0) === 1;
    if (!invoiceCreated) return json({ error: "Insufficient stock or invoice could not be saved" }, 409);
    return json({ ok: true, invoiceId, invoiceRef, lines: lines.length }, 201);
  }


  if (path === "/api/cash-transactions" && request.method === "POST") {
    if (!requireAdmin(user)) return json({ error: "Admin permission required" }, 403);
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" }, 403);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS cash_transactions (id TEXT PRIMARY KEY, movement_type TEXT NOT NULL CHECK(movement_type IN ('opening','income','expense')), movement_date TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', amount REAL NOT NULL CHECK(amount > 0), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), active INTEGER NOT NULL DEFAULT 1)").run();
    const data = await body(request);
    const type = ["opening","income","expense"].includes(data.type) ? data.type : "";
    const date = clean(data.date,10), category = clean(data.category || "",80), description = clean(data.description || "",240), amount = Number(data.amount);
    if (!type || !validDate(date) || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) return json({ error: "تأكد من نوع الحركة والتاريخ والمبلغ" },400);
    if (type === "opening") {
      const existing = await env.DB.prepare("SELECT id FROM cash_transactions WHERE movement_type='opening' AND active=1 LIMIT 1").first();
      if (existing) return json({ error: "تم تسجيل رصيد افتتاحي من قبل. استعمل حركة إيداع أو سحب لتعديل الصندوق." },409);
    }
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO cash_transactions(id,movement_type,movement_date,category,description,amount,created_by) VALUES(?,?,?,?,?,?,?)").bind(id,type,date,category,description,amount,user.display_name).run();
    return json({ ok:true,id },201);
  }
  if (path.startsWith("/api/cash-transactions/") && request.method === "DELETE") {
    if (!requireAdmin(user)) return json({ error: "Admin permission required" },403);
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" },403);
    const id = path.split("/").filter(Boolean)[2] || "";
    const result = await env.DB.prepare("UPDATE cash_transactions SET active=0 WHERE id=? AND active=1").bind(id).run();
    return Number(result.meta?.changes||0)===1 ? json({ok:true}) : json({error:"حركة الصندوق غير موجودة"},404);
  }

  if (path.startsWith("/api/admin/")) {
    if (!requireAdmin(user)) return json({ error: "Admin permission required" }, 403);
    if (!sameOrigin(request, env)) return json({ error: "Origin rejected" }, 403);
    const parts = path.split("/").filter(Boolean);
    const resource = parts[2];
    const id = parts[3] || "";
    const tables = {
      products: { table: "products", fields: ["name","unit","price","opening_stock","current_stock","supplier_name"] },
      employees: { table: "employees", fields: ["name"] },
      zones: { table: "zones", fields: ["name"] },
      suppliers: { table: "suppliers", fields: ["name","phone"] },
      customers: { table: "customers", fields: ["name","phone","address","notes"] }
    };
    const cfg = tables[resource];
    if (!cfg) return json({ error: "Unknown admin resource" }, 404);
    if (resource === "products" && request.method === "POST" && id === "import") {
      const data = await body(request);
      if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 300) {
        return json({ error: "Provide between 1 and 300 products" }, 400);
      }
      const existing = await env.DB.prepare("SELECT lower(name) AS key FROM products WHERE active=1").all();
      const known = new Set((existing.results || []).map(x => String(x.key || "").trim()));
      const statements = [];
      let skipped = 0;
      for (const item of data.items) {
        const name = clean(item?.name, 120);
        const unit = clean(item?.unit, 20);
        const price = Number(item?.price ?? 0);
        const stock = Number(item?.stock ?? 0);
        const key = name.toLocaleLowerCase("en").trim();
        if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(stock) || stock < 0) {
          return json({ error: "One or more product rows contain invalid data" }, 400);
        }
        if (known.has(key)) { skipped++; continue; }
        known.add(key);
        statements.push(env.DB.prepare("INSERT INTO products(id,name,unit,price,opening_stock,current_stock,supplier_name) VALUES(?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), name, unit, price, stock, stock, ""));
      }
      if (statements.length) await env.DB.batch(statements);
      return json({ ok: true, added: statements.length, skipped }, 201);
    }
    if (request.method === "POST") {
      const data = await body(request);
      const name = clean(data.name, 120);
      if (!name) return json({ error: "Name is required" }, 400);
      const newId = crypto.randomUUID();
      if (resource === "products") {
        const price = Number(data.price), stock = Number(data.stock ?? data.opening_stock ?? 0);
        if (!Number.isFinite(price) || price < 0 || !Number.isFinite(stock) || stock < 0) return json({ error: "Invalid price or stock" }, 400);
        await env.DB.prepare("INSERT INTO products(id,name,unit,price,opening_stock,current_stock,supplier_name) VALUES(?,?,?,?,?,?,?)")
          .bind(newId,name,clean(data.unit,20),price,stock,stock,clean(data.supplier_name,120)).run();
      } else if (resource === "employees") {
        const email = clean(data.email, 190).toLowerCase();
        const password = typeof data.password === "string" ? data.password : "";
        if (!validEmail(email) || password.length < 12 || password.length > 200) {
          return json({ error: "Indiquez un email valide et un mot de passe d'au moins 12 caractères." }, 400);
        }
        const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
        if (existing) return json({ error: "Cet email est déjà utilisé." }, 409);
        const salt = randomHex(16);
        const hash = await passwordHash(password, salt);
        const userId = crypto.randomUUID();
        await env.DB.batch([
          env.DB.prepare("INSERT INTO users(id,email,display_name,role,password_hash,password_salt,password_iterations) VALUES(?,?,?,?,?,?,?)")
            .bind(userId,email,name,"employe",hash,salt,ITERATIONS),
          env.DB.prepare("INSERT INTO employees(id,name,user_id) VALUES(?,?,?)").bind(newId,name,userId)
        ]);
      } else if (resource === "zones") {
        await env.DB.prepare("INSERT INTO zones(id,name) VALUES(?,?)").bind(newId,name).run();
      } else if (resource === "customers") {
        await env.DB.prepare("INSERT INTO customers(id,name,phone,address,notes) VALUES(?,?,?,?,?)")
          .bind(newId,name,clean(data.phone,40),clean(data.address,240),clean(data.notes,500)).run();
      } else {
        await env.DB.prepare("INSERT INTO suppliers(id,name,phone) VALUES(?,?,?)").bind(newId,name,clean(data.phone,40)).run();
      }
      return json({ ok: true, id: newId }, 201);
    }
    if (request.method === "PUT" && resource === "customers" && id) {
      const data = await body(request);
      const name = clean(data.name, 120), phone = clean(data.phone, 40), address = clean(data.address, 240), notes = clean(data.notes, 500);
      if (!name) return json({ error: "اسم الزبون مطلوب" }, 400);
      const result = await env.DB.prepare("UPDATE customers SET name=?,phone=?,address=?,notes=? WHERE id=? AND active=1")
        .bind(name,phone,address,notes,id).run();
      return Number(result.meta?.changes || 0) === 1 ? json({ ok: true }) : json({ error: "الزبون غير موجود" }, 404);
    }
    if (request.method === "PUT" && resource === "products" && id) {
      const data = await body(request);
      const name = clean(data.name, 120);
      const unit = clean(data.unit, 20);
      const supplierName = clean(data.supplier_name, 120);
      const price = Number(data.price);
      if (!name || !Number.isFinite(price) || price < 0) {
        return json({ error: "اسم المنتج والثمن غير صحيحين" }, 400);
      }
      const result = await env.DB.prepare(
        "UPDATE products SET name=?,unit=?,price=?,supplier_name=? WHERE id=? AND active=1"
      ).bind(name, unit, price, supplierName, id).run();
      if (Number(result.meta?.changes || 0) !== 1) {
        return json({ error: "المنتج غير موجود أو لم يتم تعديله" }, 404);
      }
      return json({ ok: true });
    }
    if (request.method === "DELETE" && id) {
      if (resource === "employees") {
        const employee = await env.DB.prepare("SELECT user_id FROM employees WHERE id=?").bind(id).first();
        const results = await env.DB.batch([
          env.DB.prepare("UPDATE employees SET active=0 WHERE id=?").bind(id),
          ...(employee?.user_id ? [env.DB.prepare("UPDATE users SET active=0, updated_at=datetime('now') WHERE id=?").bind(employee.user_id)] : [])
        ]);
        return json({ ok: true, changes: results.reduce((sum,x)=>sum+Number(x.meta?.changes||0),0) });
      }
      const result = await env.DB.prepare(`UPDATE ${cfg.table} SET active=0 WHERE id=?`).bind(id).run();
      return json({ ok: true, changes: result.meta?.changes || 0 });
    }
    return json({ error: "Method not supported for this resource" }, 405);
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    try {
      const response = await handle(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (error?.message === "Invalid JSON body") return json({ error: "Invalid JSON body" }, 400);
      if (error?.message === "Request body too large") return json({ error: "Request body too large" }, 413);
      console.error("Menarat API error:", error);
      return json({ error: "Internal server error" }, 500);
    }
  }
};
