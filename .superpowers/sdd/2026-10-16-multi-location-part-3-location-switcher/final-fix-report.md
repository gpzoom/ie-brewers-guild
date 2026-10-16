# Final fix report - Part 3 location switcher

Fixes: (1) same-city labels, (2) chooser reopens remembered location, (3) switcher keeps search/hash, (4) /admin reads memberships once; location-switcher.server.ts and its vite allowlist entry deleted.

## RED (tests written first)
```
      Tests  7 failed | 104 passed (111)
     × a business entry reopens the remembered location when it belongs to that group 9ms
     × lists the business's locations the user is linked to, by city, with status 2ms
     × maps rows, keeps order, and drops unknown roles or missing members 8ms
     × same-city locations are told apart by street address 1ms
     × same-city locations are told apart by their own business name when it differs 1ms
     × same-city locations with nothing to tell them apart are numbered by created order 1ms
     × the trigger names the business and the current city 20ms
 FAIL  src/components/shell/LocationSwitcher.test.ts > LocationSwitcher (artboard BZ2) > the trigger names the business and the current city
 FAIL  src/lib/portal/location-groups.test.ts > chooserEntries remembered location > a business entry reopens the remembered location when it belongs to that group
 FAIL  src/lib/portal/location-groups.test.ts > locationSwitcherFor > lists the business's locations the user is linked to, by city, with status
 FAIL  src/lib/portal/location-groups.test.ts > locationSwitcherFor > same-city locations are told apart by street address
 FAIL  src/lib/portal/location-groups.test.ts > locationSwitcherFor > same-city locations are told apart by their own business name when it differs
 FAIL  src/lib/portal/location-groups.test.ts > locationSwitcherFor > same-city locations with nothing to tell them apart are numbered by created order
 FAIL  src/lib/portal/portal-access.test.ts > listPortalMemberships > maps rows, keeps order, and drops unknown roles or missing members
 Test Files  3 failed | 5 passed (8)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 7 ⎯⎯⎯⎯⎯⎯⎯
```

## GREEN / full checks
```
 RUN  v5.0.1 C:/PROJECTS/IE Brewers Guild/ie-brewers-guild


 Test Files  8 passed (8)
      Tests  111 passed (111)
   Start at  09:27:00
   Duration  695ms (transform 62%, import 26%, tests 7%, worker 4%)

---NPMTEST
      Tests  1230 passed (1230)
   Start at  09:27:02
   Duration  21.87s (tests 37%, import 34%, transform 28%, worker 2%)

  Transform  transforming modules took 17.23s · 28% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

---TSC
src/routes/survey.tsx(2,27): error TS7016: Could not find a declaration file for module '@/components/Questionnaire'. 'C:/PROJECTS/IE Brewers Guild/ie-brewers-guild/src/components/Questionnaire.jsx' implicitly has an 'any' type.
---BUILD
[2mdist/server/[22m[36massets/strip-exif-trzWHbqY.js                          [39m[1m[2m154.28 kB[22m[1m[22m
[2mdist/server/[22m[36massets/calendar-purpose-D5An6z9D.js                    [39m[1m[2m225.85 kB[22m[1m[22m
[2mdist/server/[22m[36massets/router-WhhEum2Q.js                              [39m[1m[2m383.43 kB[22m[1m[22m
[2mdist/server/[22m[36massets/server-BT1T9Olo.js                              [39m[1m[33m645.49 kB[39m[22m
[2mdist/server/[22m[36massets/server-CERWJMx_.js                              [39m[1m[33m764.33 kB[39m[22m
[32m✓ built in 5.22s[39m
```

tsc: only the pre-existing src/routes/survey.tsx error.
