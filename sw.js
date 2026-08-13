/* Offline cache.

   Network-first for our own files. This is a live web app wrapped in an iOS
   shell, so pushing is the only way fixes reach the phone — a stale cache
   silently swallows them, which is exactly what happened with the sign-in
   code length. Cache is the fallback for offline, which is the case that
   actually matters (logging a session at the crag with no signal).

   Bump CACHE when you change any file. */
var CACHE = 'crimp-v46';
var FILES = ['./','./index.html','./app.js','./manifest.json','./icon.svg'];
var NET_TIMEOUT = 4000;

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){
    /* cache:'reload' bypasses the HTTP cache. Without it, GitHub Pages'
       max-age=600 means a fresh install can repopulate the new cache with
       the OLD files and the update is lost with no error anywhere. */
    return Promise.all(FILES.map(function(u){
      return fetch(new Request(u, {cache:'reload'}))
        .then(function(res){ if(res && res.ok) return c.put(u, res); })
        .catch(function(){});
    }));
  }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k!==CACHE; })
                           .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  /* Leave Supabase and the font CDN alone — they handle their own caching
     and must never be served from a stale copy. */
  if(new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    new Promise(function(resolve){
      var settled = false;
      function done(r){ if(!settled && r){ settled = true; resolve(r); } }

      /* Don't let a hanging connection (one bar of signal at the crag) block
         the app forever — fall back to cache after a few seconds. */
      var timer = setTimeout(function(){
        caches.match(req).then(function(hit){ if(hit) done(hit); });
      }, NET_TIMEOUT);

      /* cache:'reload' here too, same reasoning as install() — plain
         fetch(req) is still allowed to answer from the browser's own HTTP
         cache, which honours GitHub Pages' max-age=600. That silently
         defeated the whole point of "network-first": for up to 10 minutes
         after any load, every subsequent "network" fetch could still
         return the same stale response with no error to notice. */
      fetch(new Request(req, {cache:'reload'})).then(function(res){
        clearTimeout(timer);
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
        }
        done(res);
      }).catch(function(){
        clearTimeout(timer);
        caches.match(req).then(function(hit){
          if(hit) { done(hit); return; }
          caches.match('./index.html').then(function(idx){ done(idx); });
        });
      });
    })
  );
});
