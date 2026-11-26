/**
 * Menarat Al Haouz API — Cloudflare Worker + D1
 * Deploy only to a staging Worker with a NEW D1 database.
 * Required bindings: DB (D1), APP_ORIGIN (Text), BOOTSTRAP_SECRET (Secret).
 * No Firebase data is read, changed, or deleted by this Worker.
 */
const COOKIE = "__Host-menarat_session";
const SESSION_DAYS = 7;
const ITERATIONS = 310000;

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

  if (path === "/api/state" && request.method === "GET") {
    const [products, employees, zones, suppliers, invoices] = await Promise.all([
      env.DB.prepare("SELECT id, name AS nom, unit AS unite, price AS prix, opening_stock AS stockInitial, current_stock AS stock, supplier_name AS fournisseur FROM products WHERE active=1 ORDER BY name").all(),
      env.DB.prepare("SELECT id, name FROM employees WHERE active=1 ORDER BY name").all(),
      env.DB.prepare("SELECT id, name FROM zones WHERE active=1 ORDER BY name").all(),
      env.DB.prepare("SELECT id, name AS nom, phone AS tel FROM suppliers WHERE active=1 ORDER BY name").all(),
      env.DB.prepare("SELECT i.*, l.id AS line_id, l.product_name AS produit,l.unit AS unite,l.quantity AS quantite,l.unit_price AS prix,l.line_total AS total FROM invoices i LEFT JOIN invoice_lines l ON l.invoice_id=i.id ORDER BY i.operation_date DESC").all()
    ]);
    const visibleInvoices = user.role === "admin" ? (invoices.results || []) : (invoices.results || []).filter(row => row.employee_name === user.display_name);
    const operations = visibleInvoices.filter(row => row.produit).map(row => ({
      id: row.line_id, factureId: row.id, invoiceRef: row.invoice_ref, date: row.operation_date, type: row.type,
      employe: row.employee_name, fournisseur: row.supplier_name, zone: row.zone_name,
      paiement: row.payment_status, produit: row.produit, unite: row.unite,
      quantite: row.quantite, prix: row.prix, total: row.total
    }));
    return json({
      user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role },
      produits: products.results || [], employes: employees.results || [],
      zones: zones.results || [], fournisseurs: suppliers.results || [],
      operations, panier: []
    });
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
    const employeeName = type === "vente"
      ? (user.role === "employe" ? user.display_name : clean(data.employeeName || user.display_name, 120))
      : supplier;
    if (type === "vente" && user.role === "admin" && data.employeeName) {
      const employee = await env.DB.prepare("SELECT name FROM employees WHERE name=? AND active=1").bind(employeeName).first();
      if (!employee && employeeName !== user.display_name) return json({ error: "Unknown employee" }, 400);
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
    statements.push(env.DB.prepare(`INSERT INTO invoices(id,invoice_ref,type,operation_date,month_key,employee_name,supplier_name,zone_name,payment_status,created_at_ms)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE 1=1${stockCondition}`).bind(
        invoiceId, invoiceRef, type, date, date.slice(0,7), employeeName, supplier, zone, payment, Date.now(), ...shortageArgs
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
      suppliers: { table: "suppliers", fields: ["name","phone"] }
    };
    const cfg = tables[resource];
    if (!cfg) return json({ error: "Unknown admin resource" }, 404);
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
      } else {
        await env.DB.prepare("INSERT INTO suppliers(id,name,phone) VALUES(?,?,?)").bind(newId,name,clean(data.phone,40)).run();
      }
      return json({ ok: true, id: newId }, 201);
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
