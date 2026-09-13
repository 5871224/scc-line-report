import { pathToFileURL } from 'node:url';
import { DateTime } from 'luxon';

const REQUIRED_ENV = [
  'SHOPLINE_TOKEN',
  'CUSTOMER_SYNC_BACKEND_KEY',
];

const CUSTOMER_SYNC_API = 'https://scc.scctoys.com.tw/api/API_CUSTOMER_SYNC';

const CUSTOMER_FIELDS = [
  'items.id',
  'items.name',
  'items.mobile_phone',
  'items.mobile_phone_verified',
  'items.email',
  'items.line_id',
  'items.custom_data',
  'items.tags',
  'items.memo',
];

function requireEnvironment() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required secret(s): ${missing.join(', ')}`);
  }
}

export function updatedAfter(now = DateTime.utc()) {
  return now.minus({ minutes: 30 }).toFormat('yyyy-MM-dd HH:mm:ss');
}

async function fetchCustomers() {
  const url = new URL('https://open.shopline.io/v1/customers');
  url.searchParams.set('per_page', '999');
  url.searchParams.set('page', '1');
  url.searchParams.set('updated_after', updatedAfter());
  CUSTOMER_FIELDS.forEach((field) => url.searchParams.append('fields[]', field));

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${process.env.SHOPLINE_TOKEN}`,
      'user-agent': 'scc-line-report/1.0',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `SHOPLINE customers request failed: HTTP ${response.status} ${response.statusText} ${text.slice(0, 300)}`,
    );
  }

  const data = await response.json();
  if (!Array.isArray(data.items)) {
    throw new Error('SHOPLINE customers response does not contain an items array.');
  }

  return data.items;
}

export function customerSyncPayload(customers, backendKey) {
  return {
    API金鑰: backendKey,
    JSON: JSON.stringify(customers),
  };
}

export function assertApiSuccess(data) {
  const result = Array.isArray(data) ? data[0] : null;
  if (result?.Code === 'OK') {
    return result;
  }

  if (Number.isInteger(result?.JSON來源筆數)) {
    // ponytail: 更新客戶 already returns this legacy first result set.
    return { Code: 'OK', CustomerCount: result.JSON來源筆數 };
  }

  throw new Error(`Customer sync API failed: ${result?.Code ?? 'INVALID_RESPONSE'}`);
}

async function updateCustomers(customers) {
  const response = await fetch(CUSTOMER_SYNC_API, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'scc-line-report/1.0',
    },
    body: JSON.stringify(customerSyncPayload(
      customers,
      process.env.CUSTOMER_SYNC_BACKEND_KEY,
    )),
  });

  if (!response.ok) {
    throw new Error(`Customer sync API request failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  return assertApiSuccess(data);
}

async function main() {
  requireEnvironment();
  const customers = await fetchCustomers();
  console.log(`Fetched ${customers.length} updated customer(s) from SHOPLINE.`);
  const result = await updateCustomers(customers);
  console.log(`Customer sync API completed successfully for ${result.CustomerCount} customer(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
