# Week 5 review

Based on stable commit `6d2087f`. No SQL has been executed.

## Migration

Review and manually apply `supabase/migrations/202610100001_saved_places.sql`
against the existing Week 4 schema before testing bookmarks. This adds only
`saved_places`, its indexes, grants, and three owner-only RLS policies.
There is no UPDATE grant or policy. The composite primary key prevents duplicate
bookmarks; foreign keys cascade when a user or recommendation is deleted.
No existing policies, auth flows, generation calls, or vote RPCs are changed.

Bookmarks refer to recommendations (`plans.id`), so two recommendations for the
same venue can be saved independently. They are private and independent of votes.
The saved page displays 24 recommendations per page, newest bookmark first.
Before migration, bookmark reads display unavailable/error states; discovery,
generation, and votes continue using their existing tables.

## Categories and scope

The existing schema grants access to `plans.place_types`. Generation already
copies those types directly from Google Places. The filter offers exact persisted
types with underscores replaced by spaces; it excludes generic metadata types.
No model inference, text matching, backfill, new API call, or category migration
is involved. Plans without types remain in All categories.
The original latest-100 feed window and popularity ranking are preserved, with
filtering before the 12-card display limit. The UI explains this scope.
Neighborhood filtering is deferred: request preferences and formatted addresses
do not reliably classify a recommendation's actual neighborhood.

## Manual acceptance checks (after applying the reviewed migration)

1. Signed out: click Save for later and visit `/saved`. Confirm sign-in prompts
   and no private data. Sign in through the existing Google control.
2. Save a Discover card without voting. Visit My Saved Places; verify the card,
   photo, map, links, and unchanged vote counts. Reload, sign out, and sign back
   into the same account; verify the bookmark remains.
3. Unsave from Discover and from My Saved Places (including the final card).
   Confirm removal after refresh and unchanged votes. Try repeated rapid clicks.
4. Generate a plan, save a result, reload its generation URL, and verify Saved.
   Vote up/down/remove on saved cards and confirm bookmarks remain independent.
5. Use a second account: verify it cannot see the first account's bookmarks.
   Using each user's authenticated Supabase client, attempt SELECT, INSERT,
   DELETE, and UPDATE against the other user's rows. SELECT/DELETE must expose
   or affect zero rows; forged-owner INSERT and all UPDATE requests must fail.
   Anonymous SELECT/INSERT/DELETE must fail. Repeat saving the same plan and
   confirm only one row exists for that user and plan.
6. Try every available category and All. Compare matching cards against their
   stored `place_types`. Confirm untyped records appear in All and missing
   category data gives a useful message. No mock records are used.
7. With more than 24 bookmarks, test Next/Previous and removal on the last page.
8. At mobile and desktop widths, test navigation wrapping, keyboard focus,
   category selection, save pressed states, and pending/error messages.
9. Simulate a failed bookmark request and an expired session. Confirm no false
   success, a retry/sign-in message, and continued access to existing features.
10. Regression-check Gemini generation, OAuth, profile/photo upload, protected
    movies, both vote directions/toggle, place photos, maps, and geocoding.

Live persistence, RLS isolation, OAuth, and visual checks require the configured
application and reviewed migration; static checks alone do not verify them.
