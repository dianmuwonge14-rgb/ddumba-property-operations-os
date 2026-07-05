const BASE_URL = process.env.DDUMBA_BASE_URL || "http://localhost:3002";
const PIN = process.env.DDUMBA_TEST_PIN || "123456";

function cookiesFrom(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return values.map((value) => value.split(";")[0]).join("; ");
}

async function jsonFetch(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function login(officeId, mode) {
  const { response, payload } = await jsonFetch("/api/auth/office-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ officeId, pin: PIN, mode }),
  });
  if (!response.ok) {
    throw new Error(`${mode} login failed: ${payload.error ?? response.statusText}`);
  }
  return cookiesFrom(response);
}

async function search(cookie, query) {
  const { response, payload } = await jsonFetch(`/api/collections/search?q=${encodeURIComponent(query)}`, {
    headers: { cookie },
  });
  if (!response.ok) {
    throw new Error(`search ${query}: ${payload.error ?? response.statusText}`);
  }
  return payload.results ?? [];
}

function findOffice(offices, name) {
  const normalized = name.toLowerCase();
  const office = offices.find((item) => String(item.office_name ?? "").toLowerCase().includes(normalized));
  if (!office) throw new Error(`Office not found: ${name}`);
  return office;
}

function summarize(results) {
  return results.map((result) => ({
    tenant: result.tenant?.full_name ?? null,
    room: result.room?.room_number ?? null,
    office: result.office?.office_name ?? result.office?.name ?? null,
  }));
}

async function main() {
  const { payload } = await jsonFetch("/api/auth/offices");
  const offices = payload.offices ?? [];
  const kigungu = findOffice(offices, "Kigungu");
  const lugonjo = findOffice(offices, "Lugonjo");

  const [kigunguCookie, lugonjoCookie, adminCookie] = await Promise.all([
    login(kigungu.office_id, "office"),
    login(lugonjo.office_id, "office"),
    login(kigungu.office_id, "admin"),
  ]);

  const [
    kigunguR36,
    kigunguA26,
    lugonjoA26,
    lugonjoR36,
    adminR36,
    adminA26,
  ] = await Promise.all([
    search(kigunguCookie, "R36"),
    search(kigunguCookie, "A26"),
    search(lugonjoCookie, "A26"),
    search(lugonjoCookie, "R36"),
    search(adminCookie, "R36"),
    search(adminCookie, "A26"),
  ]);

  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    checks: {
      kigunguFindsR36: kigunguR36.length > 0,
      kigunguBlocksLugonjoA26: kigunguA26.length === 0,
      lugonjoFindsA26: lugonjoA26.length > 0,
      lugonjoBlocksKigunguR36: lugonjoR36.length === 0,
      adminFindsR36: adminR36.length > 0,
      adminFindsA26: adminA26.length > 0,
    },
    samples: {
      kigunguR36: summarize(kigunguR36),
      kigunguA26: summarize(kigunguA26),
      lugonjoA26: summarize(lugonjoA26),
      lugonjoR36: summarize(lugonjoR36),
      adminR36: summarize(adminR36),
      adminA26: summarize(adminA26),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
