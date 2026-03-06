// src/components/ShareModal.tsx – Send poll via email using the Node API + Resend
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_NEWS_API_URL ?? 'http://localhost:8001'

interface Props {
    pollId: string
    question: string
    options: { text: string }[]
    onClose: () => void
}

export default function ShareModal({ pollId, question, options, onClose }: Props) {
    const overlayRef = useRef<HTMLDivElement>(null)
    const [email, setEmail] = useState('')
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(false)

    const pollUrl = `${window.location.origin}/?poll=${pollId}`

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim()) return

        setLoading(true)
        try {
            const res = await fetch(`${API_URL}/email/share-poll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: email.trim(),
                    recipientName: name.trim() || undefined,
                    pollQuestion: question,
                    pollUrl,
                    pollOptions: options.map(o => o.text),
                }),
            })

            if (!res.ok) {
                const { error } = await res.json() as { error?: string }
                throw new Error(error ?? 'Error enviando el correo')
            }

            toast.success(`¡Encuesta enviada a ${email}!`)
            onClose()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error enviando el correo')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div
            className="modal-overlay"
            ref={overlayRef}
            onClick={e => { if (e.target === overlayRef.current) onClose() }}
            role="dialog"
            aria-modal="true"
        >
            <div className="modal-box share-modal-box">
                <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

                <div className="qr-modal-header">
                    <span className="qr-icon">✉️</span>
                    <h2 className="qr-modal-title">Enviar por correo</h2>
                </div>

                <p className="qr-modal-question">"{question}"</p>

                <form onSubmit={handleSend} className="share-form">
                    <div className="auth-field">
                        <label>Nombre del destinatario (opcional)</label>
                        <input
                            type="text"
                            placeholder="María García"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div className="auth-field">
                        <label>Correo electrónico *</label>
                        <input
                            type="email"
                            placeholder="destinatario@email.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="share-options-preview">
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Opciones de la encuesta:</p>
                        {options.slice(0, 4).map((opt, i) => (
                            <div key={i} className="share-option-item">
                                <span className="share-option-num">{i + 1}</span>
                                <span>{opt.text}</span>
                            </div>
                        ))}
                    </div>

                    <button
                        className="btn-auth-submit"
                        type="submit"
                        disabled={loading}
                        style={{ marginTop: 8 }}
                    >
                        {loading ? <span className="spinner" /> : '📨 Enviar encuesta'}
                    </button>
                </form>
            </div>
        </div>
    )
}
