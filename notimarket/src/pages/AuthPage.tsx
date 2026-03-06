// src/pages/AuthPage.tsx – Stunning login / register page
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

type Tab = 'login' | 'register'

export default function AuthPage() {
    const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth()
    const [tab, setTab] = useState<Tab>('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        let err: string | null = null

        if (tab === 'login') {
            err = await signInWithEmail(email, password)
        } else {
            if (!name.trim()) { toast.error('Ingresa tu nombre'); setLoading(false); return }
            err = await signUpWithEmail(email, password, name)
            if (!err) toast.success('¡Revisa tu correo para confirmar tu cuenta!')
        }

        if (err) toast.error(err)
        setLoading(false)
    }

    return (
        <div className="auth-page">
            {/* Background orbs */}
            <div className="auth-orb auth-orb-1" />
            <div className="auth-orb auth-orb-2" />
            <div className="auth-orb auth-orb-3" />

            <div className="auth-card">
                {/* Logo */}
                <div className="auth-logo">
                    <span className="auth-logo-dot" />
                    <span className="auth-logo-text">TuNoti</span>
                    <span className="auth-logo-badge">RD</span>
                </div>

                <p className="auth-tagline">
                    La plataforma de encuestas políticas de República Dominicana
                </p>

                {/* Tabs */}
                <div className="auth-tabs">
                    <button
                        className={`auth-tab${tab === 'login' ? ' active' : ''}`}
                        onClick={() => setTab('login')}
                    >
                        Iniciar sesión
                    </button>
                    <button
                        className={`auth-tab${tab === 'register' ? ' active' : ''}`}
                        onClick={() => setTab('register')}
                    >
                        Registrarse
                    </button>
                </div>

                {/* Google */}
                <button className="btn-google" onClick={signInWithGoogle} type="button">
                    <svg width="18" height="18" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continuar con Google
                </button>

                <div className="auth-divider"><span>o</span></div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="auth-form">
                    {tab === 'register' && (
                        <div className="auth-field">
                            <label>Nombre completo</label>
                            <input
                                type="text"
                                placeholder="Juan Pérez"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                            />
                        </div>
                    )}

                    <div className="auth-field">
                        <label>Correo electrónico</label>
                        <input
                            type="email"
                            placeholder="juan@email.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="auth-field">
                        <label>Contraseña</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>

                    <button className="btn-auth-submit" type="submit" disabled={loading}>
                        {loading
                            ? <span className="spinner" />
                            : tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta'
                        }
                    </button>
                </form>

                <p className="auth-footer">
                    Al continuar aceptas los{' '}
                    <a href="#">Términos de uso</a> y la{' '}
                    <a href="#">Política de privacidad</a>.
                </p>
            </div>
        </div>
    )
}
