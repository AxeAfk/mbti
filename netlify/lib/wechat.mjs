import { createDecipheriv, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto'

export const price = 2000

function pem(value) {
  const input = value?.trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim()
  if (!input) return input
  const normalized = input.startsWith('base64:')
    ? Buffer.from(input.slice(7), 'base64').toString('utf8')
    : input.replace(/\\r\\n|\\n|\r\n/g, '\n')
  const block = normalized.trim().match(/^-----BEGIN ([A-Z ]+)-----([\sA-Za-z0-9+/=]+)-----END \1-----$/)
  if (!block) return normalized
  const [, label, body] = block
  const lines = body.replace(/\s/g, '').match(/.{1,64}/g) || []
  return ['-----BEGIN ' + label + '-----', ...lines, '-----END ' + label + '-----'].join('\n')
}

function parseKey(parse, value, code) {
  try {
    const key = parse(value)
    if (key.asymmetricKeyType !== 'rsa') throw new Error('Not an RSA key')
    return key
  } catch {
    throw Object.assign(new Error('Invalid WeChat payment PEM'), { code })
  }
}

export function wechat(env) {
  const { SITE_ORIGIN, WECHAT_APP_ID, WECHAT_MCH_ID, WECHAT_MERCHANT_SERIAL,
    WECHAT_PUBLIC_KEY_ID, WECHAT_API_V3_KEY } = env
  const privateKey = pem(env.WECHAT_PRIVATE_KEY)
  const publicKey = pem(env.WECHAT_PUBLIC_KEY)
  const enabled = Boolean(SITE_ORIGIN?.startsWith('https://') && WECHAT_APP_ID && WECHAT_MCH_ID &&
    WECHAT_MERCHANT_SERIAL && WECHAT_PUBLIC_KEY_ID && privateKey && publicKey &&
    Buffer.byteLength(WECHAT_API_V3_KEY || '') === 32)

  function authentic(headers, body) {
    const timestamp = headers.get('wechatpay-timestamp')
    const nonce = headers.get('wechatpay-nonce')
    const signature = headers.get('wechatpay-signature')
    return enabled && timestamp && nonce && signature &&
      headers.get('wechatpay-serial') === WECHAT_PUBLIC_KEY_ID &&
      Math.abs(Date.now() / 1000 - Number(timestamp)) < 300 &&
      verify('RSA-SHA256', Buffer.from(timestamp + '\n' + nonce + '\n' + body + '\n'),
        parseKey(createPublicKey, publicKey, 'INVALID_WECHAT_PUBLIC_KEY'), Buffer.from(signature, 'base64'))
  }

  async function call(method, path, payload) {
    const body = payload ? JSON.stringify(payload) : ''
    const timestamp = Math.floor(Date.now() / 1000)
    const nonce = randomBytes(16).toString('hex')
    const message = [method, path, timestamp, nonce, body, ''].join('\n')
    const paymentKey = parseKey(createPrivateKey, privateKey, 'INVALID_WECHAT_PRIVATE_KEY')
    parseKey(createPublicKey, publicKey, 'INVALID_WECHAT_PUBLIC_KEY')
    const signature = sign('RSA-SHA256', Buffer.from(message), paymentKey).toString('base64')
    const authorization = 'WECHATPAY2-SHA256-RSA2048 mchid="' + WECHAT_MCH_ID +
      '",nonce_str="' + nonce + '",timestamp="' + timestamp + '",serial_no="' +
      WECHAT_MERCHANT_SERIAL + '",signature="' + signature + '"'
    const response = await fetch('https://api.mch.weixin.qq.com' + path, {
      method, headers: {
        Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json',
        'Wechatpay-Serial': WECHAT_PUBLIC_KEY_ID,
      },
      body: payload ? body : undefined, signal: AbortSignal.timeout(8000),
    })
    const raw = await response.text()
    const requestId = response.headers.get('request-id')
    if (response.status === 204) return null
    if (response.ok && !authentic(response.headers, raw)) throw new Error('微信响应验签失败')
    if (!response.ok) {
      const error = new Error('微信支付请求失败')
      error.status = response.status
      try { error.code = JSON.parse(raw).code } catch { /* Upstream may return a non-JSON error. */ }
      error.requestId = requestId
      throw error
    }
    return JSON.parse(raw)
  }

  return {
    enabled,
    async create(id, expires) {
      const result = await call('POST', '/v3/pay/transactions/native', {
        appid: WECHAT_APP_ID, mchid: WECHAT_MCH_ID, description: '四维人格测评完整报告',
        out_trade_no: id, time_expire: new Date(expires).toISOString().replace(/\.\d+Z$/, '+00:00'),
        notify_url: new URL('/api/wechat-notify', SITE_ORIGIN).href,
        amount: { total: price, currency: 'CNY' },
      })
      if (!result.code_url?.startsWith('weixin://wxpay/')) throw new Error('微信二维码不可用')
      return result.code_url
    },
    async query(id) {
      try {
        return await call('GET', '/v3/pay/transactions/out-trade-no/' + id + '?mchid=' + WECHAT_MCH_ID)
      } catch (error) {
        if (error.status === 404) return null
        throw error
      }
    },
    async close(id) {
      await call('POST', '/v3/pay/transactions/out-trade-no/' + id + '/close', { mchid: WECHAT_MCH_ID })
    },
    notification(headers, body) {
      if (!authentic(headers, body)) throw new Error('无效通知签名')
      const event = JSON.parse(body)
      const { algorithm, ciphertext, nonce, associated_data } = event.resource
      if (event.event_type !== 'TRANSACTION.SUCCESS' || algorithm !== 'AEAD_AES_256_GCM') {
        throw new Error('无效支付通知')
      }
      const encrypted = Buffer.from(ciphertext, 'base64')
      const decipher = createDecipheriv('aes-256-gcm', Buffer.from(WECHAT_API_V3_KEY), Buffer.from(nonce))
      decipher.setAAD(Buffer.from(associated_data || ''))
      decipher.setAuthTag(encrypted.subarray(-16))
      return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]))
    },
    matches(transaction) {
      return transaction?.trade_state === 'SUCCESS' && transaction.trade_type === 'NATIVE' &&
        transaction.appid === WECHAT_APP_ID && transaction.mchid === WECHAT_MCH_ID &&
        transaction.amount?.total === price && transaction.amount.currency === 'CNY' &&
        typeof transaction.transaction_id === 'string'
    },
  }
}
