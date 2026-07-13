import React from 'react';

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-sm w-full text-center space-y-6">

        {/* Logo / titre */}
        <div>
          <h1 className="text-3xl font-serif font-bold text-gray-900">PlanYourRide</h1>
          <p className="mt-2 text-gray-500 text-sm">Planifiez vos aventures, même sans connexion.</p>
        </div>

        {/* Illustration */}
        <div className="text-7xl select-none">🚐</div>

        {/* Bouton de téléchargement */}
        <a
          href="/downloads/monpetitroadtrip.apk"
          className="flex items-center justify-center gap-3 w-full bg-gray-900 text-white font-semibold py-4 px-6 rounded-2xl text-base hover:bg-gray-700 active:scale-95 transition"
        >
          <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.523 0H6.477L0 12l6.477 12h11.046L24 12 17.523 0zm-5.523 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/>
          </svg>
          <span>Télécharger pour Android</span>
        </a>

        <p className="text-xs text-gray-400">
          APK Android · Autoriser l'installation depuis des sources inconnues dans les paramètres de votre téléphone.
        </p>

        {/* Lien vers le site */}
        <a href="/login" className="text-sm text-brand hover:underline">
          Accéder à l'application web →
        </a>
      </div>
    </div>
  );
}
