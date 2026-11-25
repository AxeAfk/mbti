import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createCipheriv, generateKeyPairSync, sign } from 'node:crypto'
import { createApi } from './netlify/lib/api.mjs'
import { score } from './netlify/lib/report.mjs'
import { wechat } from './netlify/lib/wechat.mjs'
import { questions, version } from './public/questions.mjs'

test('four axes and neutral answers', () => {
  assert.equal(questions.length, 48)
  assert.equal(score(questions.map(() => 2)).type, 'XXXX')
  assert.equal(score(questions.map(q => q.towardSecond ? 4 : 0)).type, 'ESTJ')
  assert.equal(score(questions.map(q => q.towardSecond ? 0 : 4)).type, 'INFP')
})

test('payment releases only the assessment and answers that were purchased', async () => {
  let orderId
  let transaction
  let now = Date.now()
  const payment = {
    enabled: true,
    create: async id => { orderId = id; return 'weixin://wxpay/' + id },
    query: async id => transaction?.out_trade_no === id ? transaction : null,
    matches: value => value.amount.total === 2000,
  }
  const options = { payment, qr: async url => url, secret: 'a'.repeat(32), now: () => now }
  let handle = createApi(options)
  const answers = questions.map(q => q.towardSecond ? 0 : 4)
  const ref = {
    token: 'a'.repeat(64), started: now,
    digest: createHash('sha256').update(JSON.stringify([version, answers])).digest('hex'),
  }
  const run = (action, data = ref) => handle(new Request('https://test.invalid/api/' + action, {
    method: 'POST', body: JSON.stringify(data),
  }))
  assert.equal((await (await run('status')).json()).state, 'unpaid')
  const checkout = await (await run('checkout')).json()
  assert.equal(checkout.price, 2000)
  assert.match(checkout.qr, /weixin:/)
  transaction = { out_trade_no: orderId, trade_state: 'SUCCESS', amount: { total: 2000 } }
  handle = createApi(options)
  assert.equal((await (await run('status')).json()).state, 'confirmed')
  const paid = await (await run('status', { ...ref, version, answers })).json()
  assert.equal(paid.report.type, 'INFP')
  assert.equal((await run('status', { ...ref, version, answers: questions.map(() => 2) })).status, 409)
  assert.equal((await (await run('status', { ...ref, token: 'b'.repeat(64), version, answers })).json()).state, 'unpaid')
  now += 26 * 60 * 1000
  assert.equal((await run('checkout')).status, 409)
  assert.equal((await (await run('close', { ...ref, version, answers })).json()).state, 'paid')
})

test('WeChat callback checks RSA signature, authenticated payload and amount', async () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const apiKey = 'a'.repeat(32)
  const payment = wechat({
    SITE_ORIGIN: 'https://test.invalid', WECHAT_APP_ID: 'wx-test', WECHAT_MCH_ID: 'merchant',
    WECHAT_MERCHANT_SERIAL: 'merchant-serial', WECHAT_PUBLIC_KEY_ID: 'PUB_KEY_ID_TEST',
    WECHAT_API_V3_KEY: apiKey,
    WECHAT_PRIVATE_KEY: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    WECHAT_PUBLIC_KEY: keys.publicKey.export({ type: 'spki', format: 'pem' }),
  })
  const api = createApi({ payment, secret: 'a'.repeat(32) })
  function notify(amount, corrupt = false) {
    const resourceNonce = '0123456789ab'
    const aad = 'transaction'
    const transaction = {
      transaction_id: 'test-id', appid: 'wx-test', mchid: 'merchant', trade_type: 'NATIVE',
      trade_state: 'SUCCESS', amount: { total: amount, currency: 'CNY' },
    }
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiKey), resourceNonce)
    cipher.setAAD(Buffer.from(aad))
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(transaction)), cipher.final(), cipher.getAuthTag()])
    const body = JSON.stringify({ event_type: 'TRANSACTION.SUCCESS', resource: {
      algorithm: 'AEAD_AES_256_GCM', nonce: resourceNonce, associated_data: aad, ciphertext: encrypted.toString('base64'),
    } })
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = sign('RSA-SHA256', Buffer.from([timestamp, 'notifier', body, ''].join('\n')), keys.privateKey)
    return api(new Request('https://test.invalid/api/wechat-notify', {
      method: 'POST', body, headers: { 'Wechatpay-Timestamp': String(timestamp), 'Wechatpay-Nonce': 'notifier',
        'Wechatpay-Serial': 'PUB_KEY_ID_TEST', 'Wechatpay-Signature': corrupt ? 'invalid' : signature.toString('base64') },
    }))
  }
  assert.equal((await notify(2000, true)).status, 400)
  assert.equal((await notify(1)).status, 400)
  assert.equal((await notify(2000)).status, 204)
})
