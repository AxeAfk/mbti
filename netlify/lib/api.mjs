import { createHash, createHmac } from 'node:crypto'
import { score, validAnswers } from './report.mjs'
import { version } from '../../public/questions.mjs'
import { price } from './wechat.mjs'

const hex = /^[a-f0-9]{64}$/
const duration = 25 * 60 * 1000

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function createApi({ payment, qr, secret, now = Date.now }) {
  return async function handle(request) {
    const action = new URL(request.url).pathname.split('/').at(-1)
    const enabled = payment.enabled && typeof secret === 'string' && secret.length >= 32
    if (request.method !== 'POST') return json({ error: '请求方式不支持' }, 405)
    if (action === 'availability') return json({ enabled: Boolean(enabled) })
    if (!enabled) return json({ error: '微信扫码支付尚未开通' }, 503)

    if (action === 'wechat-notify') {
      try {
        const transaction = payment.notification(request.headers, await request.text())
        if (!payment.matches(transaction)) throw new Error('交易信息不符')
        return new Response(null, { status: 204 })
      } catch {
        return json({ code: 'FAIL', message: '通知校验失败' }, 400)
      }
    }

    if (!['checkout', 'status', 'close'].includes(action)) return json({ error: '请求不存在' }, 404)
    let input
    try {
      const body = await request.text()
      if (body.length > 4096) return json({ error: '请求内容过长' }, 413)
      input = JSON.parse(body)
    } catch {
      return json({ error: '请求格式无效' }, 400)
    }
    const { token, digest, started } = input ?? {}
    if (typeof token !== 'string' || typeof digest !== 'string' || !hex.test(token) ||
      !hex.test(digest) || !Number.isSafeInteger(started) || started < 1 || started > now() + 60000) {
      return json({ error: '付款凭证无效' }, 400)
    }
    const id = createHmac('sha256', secret).update([token, digest, started].join(':')).digest('hex').slice(0, 32)
    const expires = started + duration
    try {
      if (action === 'checkout') {
        if (expires - now() < 10000) return json({ error: '二维码已过期，请更新订单' }, 409)
        return json({ price, expires, qr: await qr(await payment.create(id, expires)) })
      }
      let transaction = await payment.query(id)
      if (action === 'close' && expires <= now() && transaction?.trade_state === 'NOTPAY') {
        try { await payment.close(id) } catch { /* A concurrent payment may have won. Query again. */ }
        transaction = await payment.query(id)
      }
      if (transaction?.trade_state === 'SUCCESS') {
        if (!payment.matches(transaction) || transaction.out_trade_no !== id) throw new Error('订单校验失败')
        if (input.answers === undefined) return json({ state: 'confirmed' })
        if (input.version !== version || !validAnswers(input.answers) ||
          createHash('sha256').update(JSON.stringify([input.version, input.answers])).digest('hex') !== digest) {
          return json({ error: '当前答题记录与已付款报告不匹配' }, 409)
        }
        return json({ state: 'paid', report: score(input.answers) })
      }
      const closed = transaction && ['CLOSED', 'REVOKED', 'PAYERROR'].includes(transaction.trade_state)
      return json({ state: 'unpaid', renewable: Boolean(closed || (!transaction && expires <= now())) })
    } catch (error) {
      const safeCode = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined
      console.warn('WeChat payment request failed', {
        action, status: error?.status,
        code: safeCode(error?.code || error?.cause?.code || error?.name),
        requestId: safeCode(error?.requestId),
        signatureRejected: error?.message === '微信响应验签失败',
      })
      return json({ error: '支付服务暂时不可用，请稍后查询付款状态' }, 503)
    }
  }
}
