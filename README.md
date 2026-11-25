# 四维人格测评网站

此分支为微信 Native 支付联调版。完成 48 道题后，用户通过微信扫码支付 ¥20，服务端查单确认后生成报告。题库尚未完成正式验证。答题进度、历史记录和报告留在当前浏览器。先前已保存的报告仍可查看。

## Netlify 部署

在 Netlify 从 GitHub 导入仓库，选择 `wechat-native` 分支。仓库根目录的 `netlify.toml` 同时声明静态文件和 Functions 目录。联调用 Git 部署，单独上传 `public` 无法运行支付接口。

在联调站的 Functions 环境配置以下变量，保存后重新部署：

| 变量 | 取值 |
| --- | --- |
| `SITE_ORIGIN` | 联调站对外可访问的 HTTPS 地址 |
| `WECHAT_MCH_ID`、`WECHAT_APP_ID` | 拿到 Native 权限的商户号、已完成授权绑定的 AppID |
| `WECHAT_MERCHANT_SERIAL`、`WECHAT_PRIVATE_KEY` | 商户 API 证书序列号、对应的商户私钥 PEM |
| `WECHAT_PUBLIC_KEY_ID`、`WECHAT_PUBLIC_KEY` | 微信支付公钥 ID 与对应的公钥 PEM |
| `WECHAT_API_V3_KEY` | 商户的 32 字节 API v3 密钥 |
| `PAYMENT_ORDER_SECRET` | 联调站自生成的至少 32 字符随机密钥。更换会影响旧订单查询 |

敏感值直接填入 Netlify。回调地址为站点地址加 `/api/wechat-notify`。用户页面通过查单验证商户、AppID、金额、币种和本次测评后解锁报告。

## 本地验证

在本目录运行 `npm run dev`，打开终端打印的地址。运行 `npm test` 可检查计分逻辑和保留的支付服务逻辑。

本地静态预览能完成答题，真实下单需要 Functions 环境。联调时检查二维码、扫码账单的商户与金额、支付后的自动解锁、刷新后的报告恢复，以及重测是否需要新付款。正式上线前完成量表验证。
