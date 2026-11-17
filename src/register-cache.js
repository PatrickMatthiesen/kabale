function isLocalDevelopment(locationLike) {
  const hostname = locationLike?.hostname?.toLowerCase();
  return locationLike?.protocol === 'https:'
    || hostname === 'localhost'
    || hostname === '::1'
    || hostname === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname ?? '')
    || hostname?.endsWith('.localhost') === true;
}

export function registerArtworkCache(
  navigatorLike = globalThis.navigator,
  locationLike = globalThis.location
) {
  if (!navigatorLike?.serviceWorker || !isLocalDevelopment(locationLike)) return Promise.resolve(null);

  try {
    return navigatorLike.serviceWorker.register(
      new URL('../sw.js', import.meta.url),
      {
        scope: new URL('../', import.meta.url).pathname,
        updateViaCache: 'none'
      }
    ).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

void registerArtworkCache();
