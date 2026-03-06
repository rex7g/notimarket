// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, type User, type Session } from '../lib/supabase'
import type { Profile } from '../types'

interface AuthCtx {
    user: User | null
    session: Session | null
    profile: Profile | null
    loading: boolean
    isAdmin: boolean
    isPremium: boolean
    signInWithEmail: (email: string, password: string) => Promise<string | null>
    signUpWithEmail: (email: string, password: string, name: string) => Promise<string | null>
    signInWithGoogle: () => Promise<void>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)

    const isAdmin = profile?.role === 'admin'
    const isPremium = profile?.is_premium === true

    const fetchProfile = async (userId: string) => {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()
        setProfile(data ?? null)
    }

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session)
            setUser(data.session?.user ?? null)
            setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s)
            setUser(s?.user ?? null)
            setLoading(false)
        })
        return () => subscription.unsubscribe()
    }, [])

    useEffect(() => {
        if (user) {
            fetchProfile(user.id)
        } else {
            setProfile(null)
        }
    }, [user])

    const signInWithEmail = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error?.message ?? null
    }

    const signUpWithEmail = async (email: string, password: string, name: string) => {
        const { error } = await supabase.auth.signUp({
            email, password,
            options: { data: { full_name: name } },
        })
        return error?.message ?? null
    }

    const signInWithGoogle = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        })
    }

    const signOut = async () => {
        await supabase.auth.signOut()
    }

    return (
        <AuthContext.Provider value={{ user, session, profile, loading, isAdmin, isPremium, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
