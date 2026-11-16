/**
 * 餃作 GYOZA — 線上訂單後台（Google Apps Script）
 *
 * 功能
 *  - doPost：接收網站結帳送出的訂單，驗證後寫入 Google Sheet，回傳正式訂單編號
 *  - 價格以「商品」工作表為準，伺服器端重新計算金額，不信任瀏覽器送來的價格
 *  - 寄送訂單確認信給顧客、新訂單通知給店家
 *  - 店家在「訂單」工作表把狀態改成「可取餐／已出貨／已取消」時，自動寄信通知顧客
 *
 * 第一次使用：在編輯器選 setup 執行一次（會建立工作表、商品價目、狀態下拉選單與觸發條件）。
 * 詳細步驟見同資料夾的 README.md。
 */

const CONFIG = {
  STORE_NAME: '餃作 GYOZA',
  SHEET_ORDERS: '訂單',
  SHEET_ITEMS: '訂單明細',
  SHEET_PRODUCTS: '商品',
  FULFILLMENTS: ['內用', '外帶', '冷凍宅配'],
  STATUSES: ['新訂單', '製作中', '可取餐', '已出貨', '已完成', '已取消'],
  MAX_QTY_PER_ITEM: 99,
  MAX_QTY_PER_ORDER: 200,
  TIMEZONE: 'Asia/Taipei'
};

const ORDER_HEADERS = ['訂單編號', '建立時間', '狀態', '取餐方式', '姓名', '手機', 'Email', '宅配地址', '品項摘要', '件數', '總金額', '來源', '備註'];
const ITEM_HEADERS = ['訂單編號', '建立時間', '商品ID', '品名', '單價', '數量', '小計'];
const PRODUCT_HEADERS = ['商品ID', '品名', '單價', '分類', '上架'];

// 與網站 index.html 的 products 相同；setup() 只在「商品」工作表是空的時候寫入
const DEFAULT_PRODUCTS = [
  ['pork', '招牌爆汁豬肉鍋貼', 85, 'gyoza'],
  ['shrimp', '韭黃鮮蝦鍋貼', 118, 'gyoza'],
  ['chili', '剝皮辣椒豬肉鍋貼', 98, 'gyoza'],
  ['veggie', '香菇時蔬鍋貼', 88, 'gyoza'],
  ['boiled-pork', '經典豬肉水餃', 90, 'dumpling'],
  ['corn', '玉米豬肉水餃', 95, 'dumpling'],
  ['hot-sour', '老火酸辣湯', 55, 'soup'],
  ['soy-milk', '焙香黑豆漿', 45, 'soup'],
  ['cucumber', '椒麻拍黃瓜', 48, 'side'],
  ['tofu', '胡麻嫩豆腐', 52, 'side'],
  ['gift-50', '招牌招財鍋貼禮盒・50 入', 780, 'gift'],
  ['gift-family', '週末家庭分享組・80 入', 1180, 'gift'],
  ['gift-festive', '金玉滿堂雙味禮盒・60 入', 980, 'gift']
];

/* ------------------------------------------------------------------ */
/* 初始化                                                              */
/* ------------------------------------------------------------------ */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);

  const orders = ensureSheet_(ss, CONFIG.SHEET_ORDERS, ORDER_HEADERS);
  const items = ensureSheet_(ss, CONFIG.SHEET_ITEMS, ITEM_HEADERS);
  const products = ensureSheet_(ss, CONFIG.SHEET_PRODUCTS, PRODUCT_HEADERS);

  if (products.getLastRow() < 2) {
    const rows = DEFAULT_PRODUCTS.map(p => p.concat([true]));
    products.getRange(2, 1, rows.length, PRODUCT_HEADERS.length).setValues(rows);
  }
  products.getRange('E2:E').insertCheckboxes();
  products.getRange('C2:C').setNumberFormat('#,##0');

  // 訂單：狀態下拉、顏色、格式
  const statusCol = ORDER_HEADERS.indexOf('狀態') + 1;
  const statusRange = orders.getRange(2, statusCol, orders.getMaxRows() - 1, 1);
  statusRange.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STATUSES, true).setAllowInvalid(false).build()
  );
  const colors = { '新訂單': '#fde2cf', '製作中': '#fff2c2', '可取餐': '#d9ead3', '已出貨': '#d0e2f3', '已完成': '#e7e7e7', '已取消': '#f4cccc' };
  orders.setConditionalFormatRules(Object.keys(colors).map(s =>
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(colors[s]).setRanges([statusRange]).build()
  ));
  orders.getRange('B2:B').setNumberFormat('yyyy-mm-dd hh:mm');
  orders.getRange('K2:K').setNumberFormat('"NT$ "#,##0');
  items.getRange('B2:B').setNumberFormat('yyyy-mm-dd hh:mm');
  items.getRange('E2:E').setNumberFormat('#,##0');
  items.getRange('G2:G').setNumberFormat('#,##0');

  // 店家通知信箱：預設為部署者本人，可在「專案設定 > 指令碼屬性」改 OWNER_EMAIL
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('OWNER_EMAIL')) props.setProperty('OWNER_EMAIL', Session.getEffectiveUser().getEmail());

  // 狀態變更通知：安裝式「編輯」觸發條件（避免重複建立）
  const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'handleStatusEdit');
  if (!exists) ScriptApp.newTrigger('handleStatusEdit').forSpreadsheet(ss).onEdit().create();

  SpreadsheetApp.getUi().alert('設定完成！\n\n接著請「部署 > 新增部署作業 > 網頁應用程式」，把網址交給網站使用。');
}

function ensureSheet_(ss, name, headers) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#261a15').setFontColor('#fffaf1');
  sh.setFrozenRows(1);
  return sh;
}

/* ------------------------------------------------------------------ */
/* 網頁應用程式入口                                                    */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, service: 'gyoza-orders' });
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // 防機器人：隱藏欄位有值就假裝成功、不寫入
    if (data.website) return json_({ ok: true, orderNo: 'GZ-RECEIVED' });

    const order = validate_(data);
    const saved = saveOrder_(order);

    try { sendCustomerEmail_(saved); } catch (err) { console.error('customer mail', err); }
    try { sendOwnerEmail_(saved); } catch (err) { console.error('owner mail', err); }

    return json_({ ok: true, orderNo: saved.orderNo, total: saved.total, count: saved.count });
  } catch (err) {
    if (err && err.userMessage) return json_({ ok: false, error: err.userMessage });
    console.error(err);
    return json_({ ok: false, error: '系統忙碌中，請稍後再試，或直接來電門市訂購。' });
  }
}

/* ------------------------------------------------------------------ */
/* 驗證與寫入                                                          */
/* ------------------------------------------------------------------ */

function userError_(msg) { const e = new Error(msg); e.userMessage = msg; return e; }

function validate_(d) {
  const name = String(d.name || '').trim();
  const phone = String(d.phone || '').replace(/[\s-]/g, '');
  const email = String(d.email || '').trim();
  const fulfillment = String(d.fulfillment || '');
  const address = String(d.address || '').trim();

  if (!name || name.length > 40) throw userError_('請填寫姓名（40 字以內）。');
  if (!/^09\d{8}$/.test(phone)) throw userError_('手機號碼格式不正確，請輸入 09 開頭的 10 碼數字。');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw userError_('電子信箱格式不正確。');
  if (CONFIG.FULFILLMENTS.indexOf(fulfillment) < 0) throw userError_('請選擇取餐方式。');
  if (fulfillment === '冷凍宅配' && (address.length < 6 || address.length > 120)) throw userError_('冷凍宅配請填寫完整地址。');

  const catalog = loadProducts_();
  const qtyById = {};
  (Array.isArray(d.items) ? d.items : []).forEach(it => {
    const id = String(it && it.id || '');
    const qty = Math.floor(Number(it && it.qty));
    if (!catalog[id]) throw userError_('購物車中有已下架或不存在的商品，請重新整理頁面後再試。');
    if (!(qty >= 1 && qty <= CONFIG.MAX_QTY_PER_ITEM)) throw userError_('商品數量不正確。');
    qtyById[id] = (qtyById[id] || 0) + qty;
  });
  const ids = Object.keys(qtyById);
  if (!ids.length) throw userError_('購物車是空的。');

  const lines = ids.map(id => {
    const p = catalog[id], qty = qtyById[id];
    return { id: id, name: p.name, price: p.price, qty: qty, subtotal: p.price * qty };
  });
  const count = lines.reduce((a, l) => a + l.qty, 0);
  if (count > CONFIG.MAX_QTY_PER_ORDER) throw userError_('單筆訂單數量過多，大量訂購請來電門市。');

  return {
    name: name, phone: phone, email: email, fulfillment: fulfillment,
    address: fulfillment === '冷凍宅配' ? address : '',
    source: String(d.source || 'web').slice(0, 20),
    lines: lines, count: count,
    total: lines.reduce((a, l) => a + l.subtotal, 0)
  };
}

function loadProducts_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_PRODUCTS);
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, PRODUCT_HEADERS.length).getValues() : [];
  const map = {};
  rows.forEach(r => {
    const id = String(r[0]).trim(), price = Number(r[2]);
    if (id && r[4] === true && price > 0) map[id] = { name: String(r[1]), price: price };
  });
  return map;
}

function saveOrder_(o) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const now = new Date();
    const day = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyyMMdd');
    const props = PropertiesService.getScriptProperties();
    const seq = Number(props.getProperty('seq_' + day) || 0) + 1;
    props.setProperty('seq_' + day, String(seq));
    const orderNo = 'GZ' + day + '-' + ('00' + seq).slice(-3);

    const summary = o.lines.map(l => l.name + ' ×' + l.qty).join('、');
    ss.getSheetByName(CONFIG.SHEET_ORDERS).appendRow([
      orderNo, now, '新訂單', o.fulfillment, safe_(o.name), "'" + o.phone, safe_(o.email),
      safe_(o.address), summary, o.count, o.total, o.source, ''
    ]);
    const itemRows = o.lines.map(l => [orderNo, now, l.id, l.name, l.price, l.qty, l.subtotal]);
    const items = ss.getSheetByName(CONFIG.SHEET_ITEMS);
    items.getRange(items.getLastRow() + 1, 1, itemRows.length, ITEM_HEADERS.length).setValues(itemRows);
    SpreadsheetApp.flush();

    return Object.assign({ orderNo: orderNo, createdAt: now }, o);
  } finally {
    lock.releaseLock();
  }
}

// 避免使用者輸入被試算表當成公式執行
function safe_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

function esc_(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function orderTableHtml_(o) {
  const rows = o.lines.map(l =>
    '<tr><td style="padding:6px 0">' + esc_(l.name) + '</td><td style="text-align:center">×' + l.qty +
    '</td><td style="text-align:right">NT$ ' + l.subtotal.toLocaleString() + '</td></tr>'
  ).join('');
  return '<table style="width:100%;border-collapse:collapse;font-size:14px">' + rows +
    '<tr><td colspan="2" style="border-top:1px solid #ddd;padding-top:8px"><b>合計（' + o.count + ' 件）</b></td>' +
    '<td style="border-top:1px solid #ddd;padding-top:8px;text-align:right"><b>NT$ ' + o.total.toLocaleString() + '</b></td></tr></table>';
}

function sendCustomerEmail_(o) {
  const html =
    '<div style="font-family:sans-serif;color:#261a15;max-width:520px">' +
    '<h2 style="color:#d86f32">訂單已收到，準備開煎！</h2>' +
    '<p>' + esc_(o.name) + ' 您好，感謝您在 ' + CONFIG.STORE_NAME + ' 訂購。</p>' +
    '<p>訂單編號：<b>' + o.orderNo + '</b><br>取餐方式：' + esc_(o.fulfillment) +
    (o.address ? '<br>宅配地址：' + esc_(o.address) : '') + '</p>' +
    orderTableHtml_(o) +
    '<p style="color:#7a6a5f;font-size:13px">餐點完成或出貨時，我們會再寄信通知您。如需更改訂單，請直接回覆此信或來電門市。</p></div>';
  MailApp.sendEmail({
    to: o.email,
    subject: '【' + CONFIG.STORE_NAME + '】訂單 ' + o.orderNo + ' 已收到',
    htmlBody: html,
    name: CONFIG.STORE_NAME,
    replyTo: ownerEmail_() || undefined
  });
}

function sendOwnerEmail_(o) {
  const to = ownerEmail_();
  if (!to) return;
  const html =
    '<div style="font-family:sans-serif;color:#261a15">' +
    '<h3>新訂單 ' + o.orderNo + '（' + esc_(o.fulfillment) + '）</h3>' +
    '<p>' + esc_(o.name) + '｜' + esc_(o.phone) + '｜' + esc_(o.email) + (o.address ? '<br>地址：' + esc_(o.address) : '') + '</p>' +
    orderTableHtml_(o) +
    '<p><a href="' + SpreadsheetApp.getActiveSpreadsheet().getUrl() + '">開啟訂單試算表</a></p></div>';
  MailApp.sendEmail({ to: to, subject: '🥟 新訂單 ' + o.orderNo + '｜NT$ ' + o.total.toLocaleString(), htmlBody: html });
}

function ownerEmail_() {
  return PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || '';
}

/* ------------------------------------------------------------------ */
/* 狀態變更通知（setup() 會建立安裝式觸發條件）                        */
/* ------------------------------------------------------------------ */

function handleStatusEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== CONFIG.SHEET_ORDERS || e.range.getRow() < 2) return;
  const statusCol = ORDER_HEADERS.indexOf('狀態') + 1;
  if (e.range.getColumn() !== statusCol || e.range.getNumColumns() !== 1 || e.range.getNumRows() !== 1) return;

  const status = String(e.value || '');
  const messages = {
    '可取餐': { subject: '餐點已完成，可以取餐囉', body: '您的餐點已經煎好，請盡快到門市取餐，趁熱最好吃！' },
    '已出貨': { subject: '冷凍禮盒已出貨', body: '您的冷凍鍋貼已交由宅配出貨，通常 1–2 個工作天送達，收到後請盡快放入冷凍庫。' },
    '已取消': { subject: '訂單已取消', body: '您的訂單已取消。如有疑問，請直接回覆此信或來電門市。' }
  };
  const msg = messages[status];
  if (!msg) return;

  const row = sh.getRange(e.range.getRow(), 1, 1, ORDER_HEADERS.length).getValues()[0];
  const orderNo = row[0], name = row[4], email = row[6];
  if (!email) return;
  MailApp.sendEmail({
    to: String(email),
    subject: '【' + CONFIG.STORE_NAME + '】' + orderNo + ' ' + msg.subject,
    htmlBody: '<div style="font-family:sans-serif;color:#261a15"><p>' + esc_(name) + ' 您好：</p><p>' + msg.body +
      '</p><p>訂單編號：<b>' + esc_(orderNo) + '</b></p><p>— ' + CONFIG.STORE_NAME + '</p></div>',
    name: CONFIG.STORE_NAME,
    replyTo: ownerEmail_() || undefined
  });
  const noteCol = ORDER_HEADERS.indexOf('備註') + 1;
  const stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM/dd HH:mm');
  const cell = sh.getRange(e.range.getRow(), noteCol);
  cell.setValue((cell.getValue() ? cell.getValue() + '\n' : '') + stamp + ' 已寄「' + status + '」通知');
}

/* ------------------------------------------------------------------ */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
