import { DateTime } from 'luxon';

const SHOPLINE_TOKEN = process.env.SHOPLINE_TOKEN;
const LINE_TOKEN = process.env.LINE_TOKEN;
const PER_PAGE = 250;
const ZONE = 'Asia/Taipei';

function requireSecrets() {
  const missing = [
    ['SHOPLINE_TOKEN', SHOPLINE_TOKEN],
    ['LINE_TOKEN', LINE_TOKEN],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Missing required secret(s): ${missing.join(', ')}`);
  }
}

function toApiDate(dateTime) {
  return dateTime.setZone('UTC').toFormat('yyyy-MM-dd HH:mm:ss');
}

async function fetchAllOrders(paramName, startLocal, endLocal) {
  if (!startLocal || !endLocal || startLocal.toMillis() > endLocal.toMillis()) {
    return [];
  }

  const start = toApiDate(startLocal);
  const end = toApiDate(endLocal);
  const allOrders = [];

  for (let page = 1; ; page += 1) {
    const url = new URL('https://open.shopline.io/v1/orders/search');
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(PER_PAGE));
    url.searchParams.set(`${paramName}_after`, start);
    url.searchParams.set(`${paramName}_before`, end);

    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${SHOPLINE_TOKEN}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `SHOPLINE ${paramName} page ${page} failed: HTTP ${response.status} ${response.statusText} ${text.slice(0, 300)}`,
      );
    }

    const data = await response.json();
    const items = data.items ?? [];
    allOrders.push(...items);

    if (items.length < PER_PAGE) break;
  }

  return allOrders;
}

function inCreatedRange(order, startLocal, endLocal) {
  if (!order.created_at) return false;
  const timestamp = new Date(order.created_at).getTime();
  return !Number.isNaN(timestamp)
    && timestamp >= startLocal.toMillis()
    && timestamp <= endLocal.toMillis();
}

function calculateStats(orders) {
  let amount = 0;

  for (const order of orders) {
    const value = order.total?.cents
      ?? order.current_total?.cents
      ?? order.total
      ?? order.total_price
      ?? 0;
    amount += Number.parseFloat(value) || 0;
  }

  return { amount: Math.round(amount), count: orders.length };
}

function netStats(created, cancelled) {
  const amount = created.amount - cancelled.amount;
  const count = created.count - cancelled.count;
  return {
    amount,
    count,
    avg: count > 0 ? Math.round(amount / count) : 0,
  };
}

async function calculateReport() {
  const now = DateTime.now().setZone(ZONE);
  const yesterday = now.minus({ days: 1 });
  const yesterdayStart = yesterday.startOf('day');
  const yesterdayEnd = yesterday.endOf('day');
  const days30Start = now.minus({ days: 30 }).startOf('day');
  const monthStart = yesterday.startOf('month').startOf('day');

  const maxRangeStart = days30Start.toMillis() < monthStart.toMillis()
    ? days30Start
    : monthStart;
  const earlierStart = maxRangeStart;
  const sharedStart = days30Start.toMillis() > monthStart.toMillis()
    ? days30Start
    : monthStart;

  const cancelledEarlierStart = earlierStart.toMillis() < sharedStart.toMillis()
    ? earlierStart
    : null;
  const cancelledEarlierEnd = cancelledEarlierStart
    ? sharedStart.minus({ days: 1 }).endOf('day')
    : null;

  const cancelledSharedStart = sharedStart.toMillis() < yesterdayStart.toMillis()
    ? sharedStart
    : null;
  const cancelledSharedEnd = cancelledSharedStart
    ? yesterdayStart.minus({ days: 1 }).endOf('day')
    : null;

  const [
    createdOrders,
    cancelledEarlier,
    cancelledShared,
    cancelledYesterday,
  ] = await Promise.all([
    fetchAllOrders('created', maxRangeStart, yesterdayEnd),
    fetchAllOrders('cancelled', cancelledEarlierStart, cancelledEarlierEnd),
    fetchAllOrders('cancelled', cancelledSharedStart, cancelledSharedEnd),
    fetchAllOrders('cancelled', yesterdayStart, yesterdayEnd),
  ]);

  const filterCreated = (start, end) => createdOrders.filter(
    (order) => inCreatedRange(order, start, end),
  );

  const sharedAndYesterday = [...cancelledShared, ...cancelledYesterday];
  let days30Cancelled;
  let monthCancelled;

  if (days30Start.toMillis() < monthStart.toMillis()) {
    days30Cancelled = [...cancelledEarlier, ...sharedAndYesterday];
    monthCancelled = sharedAndYesterday;
  } else if (monthStart.toMillis() < days30Start.toMillis()) {
    monthCancelled = [...cancelledEarlier, ...sharedAndYesterday];
    days30Cancelled = sharedAndYesterday;
  } else {
    days30Cancelled = sharedAndYesterday;
    monthCancelled = sharedAndYesterday;
  }

  const yesterdayNet = netStats(
    calculateStats(filterCreated(yesterdayStart, yesterdayEnd)),
    calculateStats(cancelledYesterday),
  );
  const days30Net = netStats(
    calculateStats(filterCreated(days30Start, yesterdayEnd)),
    calculateStats(days30Cancelled),
  );
  const monthNet = netStats(
    calculateStats(filterCreated(monthStart, yesterdayEnd)),
    calculateStats(monthCancelled),
  );

  return {
    yesterday: {
      label: '昨日',
      date: yesterday.toFormat('yyyy-MM-dd'),
      ...yesterdayNet,
    },
    days30: {
      label: '近 30 天',
      date: `${days30Start.toFormat('yyyy-MM-dd')}起`,
      ...days30Net,
    },
    month: {
      label: '本月',
      date: `${monthStart.toFormat('yyyy-MM-dd')}起`,
      ...monthNet,
    },
    fetched: {
      created: createdOrders.length,
      cancelledEarlier: cancelledEarlier.length,
      cancelledShared: cancelledShared.length,
      cancelledYesterday: cancelledYesterday.length,
    },
  };
}

function money(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

function summaryBox(item, theme) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: theme.background,
    cornerRadius: '12px',
    paddingAll: '16px',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        alignItems: 'center',
        contents: [
          {
            type: 'text', text: item.label, color: theme.primary,
            size: 'lg', weight: 'bold', flex: 1,
          },
          {
            type: 'text', text: item.date, color: theme.secondary,
            size: 'xs', align: 'end',
          },
        ],
      },
      { type: 'separator', color: theme.separator, margin: 'md' },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'lg',
        alignItems: 'flex-end',
        contents: [
          { type: 'text', text: '營業額', color: '#667085', size: 'sm', flex: 2 },
          {
            type: 'text', text: `$ ${money(item.amount)}`, color: theme.primary,
            size: 'xl', weight: 'bold', align: 'end', flex: 5,
          },
        ],
      },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'lg',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            flex: 1,
            contents: [
              { type: 'text', text: '訂單筆數', color: '#98A2B3', size: 'xs' },
              {
                type: 'text', text: `${money(item.count)} 筆`, color: '#344054',
                size: 'md', weight: 'bold', margin: 'sm',
              },
            ],
          },
          { type: 'separator', color: theme.separator },
          {
            type: 'box',
            layout: 'vertical',
            flex: 1,
            paddingStart: '16px',
            contents: [
              { type: 'text', text: '客單價', color: '#98A2B3', size: 'xs' },
              {
                type: 'text', text: `$ ${money(item.avg)}`, color: '#344054',
                size: 'md', weight: 'bold', margin: 'sm',
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildLineBody(report) {
  return {
    messages: [{
      type: 'flex',
      altText: 'SHOPLINE 業績報告',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#0954EB',
          paddingAll: '20px',
          contents: [{
            type: 'text', text: 'SHOPLINE 業績報告', color: '#FFFFFF',
            size: 'xl', weight: 'bold',
          }],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '18px',
          spacing: 'lg',
          contents: [
            summaryBox(report.yesterday, {
              background: '#F2F6FF', primary: '#0954EB', secondary: '#6E8CC7', separator: '#D8E3FA',
            }),
            summaryBox(report.days30, {
              background: '#F0FDF4', primary: '#12B76A', secondary: '#5F9F7B', separator: '#D1FADF',
            }),
            summaryBox(report.month, {
              background: '#FFF7ED', primary: '#F79009', secondary: '#B7791F', separator: '#FEDF89',
            }),
          ],
        },
      },
    }],
  };
}

async function sendLineReport(report) {
  const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify(buildLineBody(report)),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `LINE broadcast failed: HTTP ${response.status} ${response.statusText} ${text.slice(0, 300)}`,
    );
  }
}

async function main() {
  requireSecrets();
  const report = await calculateReport();

  console.log('Report calculated:', {
    yesterday: report.yesterday,
    days30: report.days30,
    month: report.month,
    fetched: report.fetched,
  });

  await sendLineReport(report);
  console.log('LINE broadcast sent successfully.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
