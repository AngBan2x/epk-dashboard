'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { ImageUploader } from '@/components/ImageUploader';
import { ArtistSocialLinks, SocialPlatformIcon } from '@/components/ArtistSocialLinks';
import {
  SOCIAL_PLATFORMS,
  filterValidSocialLinks,
  validateSocialUrl,
} from '@/lib/social-platforms';
import { safeParseJSON } from '@/lib/null-safe';
import type { SocialLink } from '@/types/music';

interface ArtistProfile {
  id: string;
  name: string;
  bio: string | null;
  genre: string | null;
  country: string | null;
  city: string | null;
  profile_image: string | null;
  banner_image: string | null;
  social_links: SocialLink[] | null;
  slug: string | null;
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [genre, setGenre] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [bannerImage, setBannerImage] = useState('');
  const [slug, setSlug] = useState('');
  const [socialInputs, setSocialInputs] = useState<Record<string, string>>({});
  const [socialTouched, setSocialTouched] = useState<Record<string, boolean>>({});
  const [showSocialEditor, setShowSocialEditor] = useState(false);

  const setPlatformValue = (key: string, value: string) => {
    setSocialInputs((prev) => ({ ...prev, [key]: value }));
  };

  const markPlatformTouched = (key: string) => {
    setSocialTouched((prev) => ({ ...prev, [key]: true }));
  };

  const clearPlatform = (key: string) => {
    setSocialInputs((prev) => ({ ...prev, [key]: '' }));
    setSocialTouched((prev) => ({ ...prev, [key]: false }));
  };

  const socialErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const platform of SOCIAL_PLATFORMS) {
      const value = (socialInputs[platform.key] ?? '').trim();
      if (!value) continue;
      const result = validateSocialUrl(platform.key, value);
      if (!result.valid && result.error) errors[platform.key] = result.error;
    }
    return errors;
  }, [socialInputs]);

  const socialErrorList = useMemo(
    () =>
      SOCIAL_PLATFORMS.filter((platform) => Boolean(socialErrors[platform.key])).map(
        (platform) => ({ key: platform.key, label: platform.label, message: socialErrors[platform.key] })
      ),
    [socialErrors]
  );

  const configuredPlatforms = useMemo(
    () =>
      SOCIAL_PLATFORMS.filter((platform) => {
        const value = (socialInputs[platform.key] ?? '').trim();
        return value.length > 0 && !socialErrors[platform.key];
      }),
    [socialInputs, socialErrors]
  );

  const buildSocialLinks = (): SocialLink[] =>
    filterValidSocialLinks(
      configuredPlatforms.map((platform) => ({
        platform: platform.key,
        url: socialInputs[platform.key] ?? '',
      }))
    );

  const applySocialLinks = (raw: unknown) => {
    const parsed: SocialLink[] = Array.isArray(raw)
      ? (raw as SocialLink[])
      : typeof raw === 'string' && raw
        ? safeParseJSON<SocialLink[]>(raw, [])
        : [];

    const next: Record<string, string> = {};
    for (const link of filterValidSocialLinks(parsed)) {
      next[link.platform] = link.url;
    }
    setSocialInputs(next);
    setSocialTouched({});
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/artists/me');
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setName(data.name || '');
        setBio(data.biography || '');
        setGenre(data.genre || '');
        // Location is stored as single field "City, Country"
        const loc = data.location || '';
        const commaIdx = loc.lastIndexOf(',');
        if (commaIdx > 0) {
          setCity(loc.substring(0, commaIdx).trim());
          setCountry(loc.substring(commaIdx + 1).trim());
        } else {
          setCountry(loc);
          setCity('');
        }
        setProfileImage(data.profile_image || '');
        setBannerImage(data.banner_image || '');
        setSlug(data.slug || '');
        applySocialLinks(data.social_links);
      } else if (res.status === 404) {
        // Profile doesn't exist yet — create a blank one
        setProfile(null);
        setName(user?.name || '');
        applySocialLinks(null);
      } else {
        setError('Error al cargar el perfil');
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      setError('Error de conexión al cargar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (socialErrorList.length > 0) {
      setSaved(false);
      setError(
        `Revisa los enlaces sociales: ${socialErrorList
          .map((item) => item.label)
          .join(', ')} no son válidos.`
      );
      return;
    }

    try {
      setSaving(true);
      setSaved(false);
      setError('');

      const payload = {
        name,
        bio,
        genre,
        country,
        city,
        profile_image: profileImage || null,
        banner_image: bannerImage || null,
        slug: slug || null,
        social_links: buildSocialLinks(),
      };

      // Try PATCH first, if profile doesn't exist try POST to create
      let res = await fetch('/api/artists/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 404 && !profile) {
        // Profile doesn't exist — try creating via POST
        res = await fetch('/api/artists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setSaved(true);
        const data = await res.json();
        setProfile(data);
        setTimeout(() => setSaved(false), 3000);
      } else if (res.status === 409) {
        setError('Este nombre artístico ya está en uso. Elige otro nombre.');
      } else {
        const data = await res.json();
        setError(data.error || 'Error al guardar el perfil');
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      setError('Error de conexión al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Mi Perfil</h1>
          <p className="text-slate-500 dark:text-slate-400">Gestiona tu perfil de artista público</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-slate-400">Cargando perfil...</div>
        ) : (
          <div className="space-y-6">
            {/* Banner Preview */}
            {bannerImage && (
              <div className="relative h-40 rounded-xl overflow-hidden">
                <Image src={bannerImage} alt="Banner" width={1200} height={400} unoptimized className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
            )}

            {/* Profile Image */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Imagen de Perfil</h2>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700 shrink-0">
                  {profileImage ? (
                    <Image src={profileImage} alt="Profile" width={80} height={80} unoptimized className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-slate-400">
                      {name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">URL de imagen</label>
                  <input
                    type="url"
                    value={profileImage}
                    onChange={(e) => setProfileImage(e.target.value)}
                    placeholder="https://ejemplo.com/foto.jpg"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                  />
                  <div className="mt-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">O sube un archivo (JPG/PNG/WebP, max 5MB)</p>
                    {profile?.id ? (
                      <ImageUploader
                        kind="profile"
                        artistId={profile.id}
                        uploadId={`profile-${profile.id}`}
                        onUploadComplete={(url) => setProfileImage(url)}
                      />
                    ) : (
                      <p className="text-xs text-slate-400">Guarda el perfil primero para habilitar la subida.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Banner Image */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Imagen de Banner</h2>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">URL de banner</label>
              <input
                type="url"
                value={bannerImage}
                onChange={(e) => setBannerImage(e.target.value)}
                placeholder="https://ejemplo.com/banner.jpg (1200x400 recomendado)"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
              />
              <div className="mt-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">O sube un archivo (JPG/PNG/WebP, max 5MB)</p>
                {profile?.id ? (
                  <ImageUploader
                    kind="banner"
                    artistId={profile.id}
                    uploadId={`banner-${profile.id}`}
                    onUploadComplete={(url) => setBannerImage(url)}
                  />
                ) : (
                  <p className="text-xs text-slate-400">Guarda el perfil primero para habilitar la subida.</p>
                )}
              </div>
            </div>

            {/* Basic Info */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Información Básica</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre artístico *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre artístico"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Cuéntanos sobre ti y tu música..."
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Género</label>
                    <input
                      type="text"
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      placeholder="Rock, Pop, Jazz..."
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">País</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Venezuela"
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ciudad</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Caracas"
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Slug (URL amigable)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400">pressplay.app/artist/</span>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, ''))}
                      placeholder="mi-nombre"
                      className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Social Links */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Redes Sociales</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {configuredPlatforms.length} de {SOCIAL_PLATFORMS.length} plataformas configuradas
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {configuredPlatforms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSocialInputs({});
                        setSocialTouched({});
                      }}
                      aria-label="Quitar todos los enlaces sociales"
                      className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800"
                    >
                      Quitar todos
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSocialEditor((prev) => !prev)}
                    aria-expanded={showSocialEditor}
                    aria-controls="social-links-editor"
                    className="px-3 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800"
                  >
                    {showSocialEditor ? 'Ocultar' : 'Añadir'}
                  </button>
                </div>
              </div>

              {configuredPlatforms.length > 0 && (
                <div className="mb-5 p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Vista previa</p>
                  <ArtistSocialLinks
                    socialLinks={buildSocialLinks()}
                    artistName={name}
                    showLabels
                    ariaLabel="Vista previa de tus redes sociales"
                  />
                </div>
              )}

              {showSocialEditor && (
                <div id="social-links-editor" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {SOCIAL_PLATFORMS.map((platform) => {
                    const value = socialInputs[platform.key] ?? '';
                    const hasValue = value.trim().length > 0;
                    const error = socialErrors[platform.key];
                    const showError = Boolean(error) && (hasValue || socialTouched[platform.key]);
                    const inputId = `social-${platform.key}`;
                    const errorId = `${inputId}-error`;

                    return (
                      <div
                        key={platform.key}
                        className={`p-3 rounded-lg border transition-colors ${
                          showError
                            ? 'border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10'
                            : hasValue
                              ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/10'
                              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <label
                            htmlFor={inputId}
                            className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
                          >
                            <span style={{ color: platform.color }} aria-hidden="true">
                              <SocialPlatformIcon platform={platform} className="w-4 h-4" />
                            </span>
                            {platform.label}
                          </label>
                          {hasValue && !error && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              <span aria-hidden="true">✓</span>
                              Configurado
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            id={inputId}
                            type="url"
                            inputMode="url"
                            autoComplete="off"
                            spellCheck={false}
                            value={value}
                            onChange={(e) => setPlatformValue(platform.key, e.target.value)}
                            onBlur={() => markPlatformTouched(platform.key)}
                            placeholder={platform.placeholder}
                            aria-invalid={showError}
                            aria-describedby={showError ? errorId : undefined}
                            className="flex-1 min-w-0 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                          />
                          {hasValue && (
                            <button
                              type="button"
                              onClick={() => clearPlatform(platform.key)}
                              aria-label={`Limpiar el enlace de ${platform.label}`}
                              title={`Limpiar ${platform.label}`}
                              className="shrink-0 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-red-600 dark:hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                            >
                              <span aria-hidden="true">✕</span>
                            </button>
                          )}
                        </div>
                        {showError && (
                          <p
                            id={errorId}
                            role="alert"
                            className="mt-2 text-xs text-red-600 dark:text-red-400"
                          >
                            {error}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {socialErrorList.length > 0 && (
                <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
                  {socialErrorList.map((item) => `${item.label}: ${item.message}`).join(' ')}
                </p>
              )}
            </div>

            {/* Save button */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar Perfil'}
              </button>
              {saved && (
                <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">✓ Perfil guardado</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
