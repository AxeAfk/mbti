import QRCode from 'qrcode'
import { createApi } from '../lib/api.mjs'
import { wechat } from '../lib/wechat.mjs'

export default createApi({
  payment: wechat(process.env),
  secret: process.env.PAYMENT_ORDER_SECRET,
  qr: url => QRCode.toDataURL(url, { width: 264 }),
})

export const config = { path: ['/api/availability', '/api/checkout', '/api/status', '/api/close', '/api/wechat-notify'] }
