// src/emailService.ts – Resend integration for sharing polls
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY ?? '')
const FROM = process.env.RESEND_FROM ?? 'NotiMarket <noreply@notimarket.do>'

export interface SharePollPayload {
    to: string
    recipientName?: string
    pollQuestion: string
    pollUrl: string
    pollOptions: string[]
}

export async function sendSharePollEmail(payload: SharePollPayload): Promise<void> {
    const { to, recipientName, pollQuestion, pollUrl, pollOptions } = payload

    const greeting = recipientName ? `Hola ${recipientName},` : 'Hola,'

    const optionsHtml = pollOptions
        .map((opt, i) => `
      <tr>
        <td style="padding:8px 12px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#6c63ff;color:#fff;border-radius:50%;font-size:11px;font-weight:700;margin-right:10px;">${i + 1}</span>
          <span style="font-size:14px;color:#374151;">${opt}</span>
        </td>
      </tr>`)
        .join('')

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Encuesta NotiMarket</title>
</head>
<body style="margin:0;padding:0;background:#0d0f14;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" style="max-width:520px;background:#1a1e2a;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid rgba(255,255,255,0.08);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="display:inline-block;width:10px;height:10px;background:#6c63ff;border-radius:50%;box-shadow:0 0 8px #6c63ff;margin-right:8px;"></span>
                    <span style="font-size:18px;font-weight:800;color:#eef0f7;letter-spacing:-0.5px;">NotiMarket</span>
                    <span style="font-size:11px;font-weight:600;color:#555b73;margin-left:4px;">RD</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="font-size:14px;color:#8a90a6;margin:0 0 20px;">${greeting}</p>
              <p style="font-size:14px;color:#8a90a6;margin:0 0 24px;line-height:1.6;">
                Te comparto una encuesta sobre las noticias más relevantes de República Dominicana. 
                ¡Tu opinión cuenta!
              </p>

              <!-- Question box -->
              <div style="background:#13161e;border:1px solid rgba(255,255,255,0.08);border-left:4px solid #6c63ff;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                <p style="font-size:15px;font-weight:700;color:#eef0f7;margin:0;line-height:1.5;">${pollQuestion}</p>
              </div>

              <!-- Options -->
              <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#555b73;margin:0 0 12px;">Opciones de respuesta</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#13161e;border:1px solid rgba(255,255,255,0.06);border-radius:8px;overflow:hidden;margin-bottom:28px;">
                ${optionsHtml}
              </table>

              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${pollUrl}"
                      style="display:inline-block;padding:13px 32px;background:#6c63ff;color:#fff;font-size:14px;font-weight:700;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
                      🗳️ Votar en la encuesta
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="font-size:11px;color:#555b73;margin:0;text-align:center;line-height:1.6;">
                Este correo fue enviado desde <strong style="color:#8a90a6;">NotiMarket RD</strong>.<br />
                Si no esperabas este mensaje, puedes ignorarlo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const { error } = await resend.emails.send({
        from: FROM,
        to: [to],
        subject: `📊 Encuesta: ${pollQuestion.slice(0, 60)}${pollQuestion.length > 60 ? '…' : ''}`,
        html,
    })

    if (error) {
        throw new Error(`Resend error: ${error.message}`)
    }
}
