// src/components/QRModal.tsx
import { useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'

interface Props {
    pollId: string
    question: string
    onClose: () => void
}

export default function QRModal({ pollId, question, onClose }: Props) {
    const overlayRef = useRef<HTMLDivElement>(null)
    const pollUrl = `${window.location.origin}/?ref=qr&poll_id=${pollId}`

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const copyLink = () => {
        navigator.clipboard.writeText(pollUrl)
        toast.success('¡Enlace copiado!')
    }

    return (
        <div
            className="modal-overlay"
            ref={overlayRef}
            onClick={e => { if (e.target === overlayRef.current) onClose() }}
            role="dialog"
            aria-modal="true"
            aria-label="Código QR de la encuesta"
        >
            <div className="modal-box qr-modal-box">
                <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

                <div className="qr-modal-header">
                    <span className="qr-icon">📱</span>
                    <h2 className="qr-modal-title">Compartir encuesta</h2>
                </div>

                <p className="qr-modal-question">"{question}"</p>

                <div className="qr-code-wrapper">
                    <QRCodeSVG
                        value={pollUrl}
                        size={200}
                        bgColor="transparent"
                        fgColor="var(--accent-light)"
                        level="M"
                        includeMargin={false}
                    />
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                    Escanea el código para acceder a la encuesta
                </p>

                <div className="qr-url-box">
                    <span className="qr-url-text">{pollUrl}</span>
                    <button className="btn btn-ghost" style={{ flexShrink: 0, padding: '6px 12px', fontSize: '0.78rem' }} onClick={copyLink}>
                        📋 Copiar
                    </button>
                </div>
            </div>
        </div>
    )
}
