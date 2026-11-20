diff --git a/AGENTS.md b/AGENTS.md
index 42259067321be51f77534f2881b6dcceb7094b6a..3d303c7a50c5245a11fe2c20af72fcc5e242f5b1 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -276,7 +276,8 @@ Keep the abstraction small. Do not build a generic framework around it.
 FIN, VÖEN, contact details, photo, address), the profiles they can act as, the active
 profile, and optional permissions. `mygovAuthService.toUserSession` maps the Identity
 Service's `GET me` onto it; the cabinet reads it once through `SessionProvider`, and the
-profile page shows it — there is no separate profile dataset.
+profile page shows it — there is no separate profile dataset. The profile page saves the
+contact details through `updateContact` (`PUT me`), whose answer replaces the session.
 
 The Identity Service has no profiles yet, so the session has one `individual` profile.
 `switchProfile` is a frontend proposal the cabinet does not call yet.
@@ -440,13 +441,16 @@ Identity Service swagger (test service: `https://api-identity-test.e-cbar.az`,
 ```text
 POST mygov/auth-uri { returnUrl }      → { authorizationUrl, state, provider, expiresAt }  flow A
 POST mygov/sign-in  { code, state }    → { returnUrl, user, session }                      flow B
-GET  me                                → { user, session, permissions }                    after B
+GET  me                                → { user, session }                                 after B
+PUT  me             { email, phone }   → { user, session }                                 profile page
 POST refresh                           → { session } + new cookies                         flow E
 POST logout                            → 204, cookies expired                              flow D
 ```
 
-`me`'s `user` is `{ id, name, fin, tin, email, phoneNumber, image, address }`;
-`toUserSession` maps it onto `UserSession` (§8). Errors are Problem Details (§16).
+`me`'s `user` is the mygov identity (`id`, `fin`, `tin`, `firstName`, `lastName`,
+`fatherName`, birth, citizenship, `address`, document fields), `contact { phone, email }` and
+`permissions`; `toUserSession` maps what the app uses onto `UserSession` (§8). `PUT me` saves
+the contact details only. Errors are Problem Details (§16).
 
 Profile switching (acting for a legal entity) is not in the Identity Service yet; the frontend
 proposes `POST profile { profileId }`.
diff --git a/docs/architecture.md b/docs/architecture.md
index cf3ad3dc9885c1a2fc60df0cb09436748e696ce0..8ac7262599a1074f60650791c226925dd296b269 100644
--- a/docs/architecture.md
+++ b/docs/architecture.md
@@ -139,9 +139,9 @@ the top bar changes the active profile without a new login; the session's `activ
 says which one is active. The Identity Service sends no profiles yet, so a real session has
 one `individual` profile and the switcher only has choices on the mock.
 
-**Profile page.** Shows the session's user from `GET me` (name, FIN, VÖEN, photo, address,
-email, phone). The contact details form does not save yet — the Identity Service has no
-endpoint for it.
+**Profile page.** Shows the session's user from `GET me` (name, FIN, VÖEN, address, email,
+phone). The contact details form saves the email and phone with `PUT me`; its answer replaces
+the session, so the rest of the cabinet sees the new details at once.
 
 ## Cabinet services (migrated portals)
 
diff --git a/docs/data-sources.md b/docs/data-sources.md
index 4d878b877776c5c2a81444e761c1ac95a37308bc..94ca4787326cf20d6ce99b0c60df4f72c0734436 100644
--- a/docs/data-sources.md
+++ b/docs/data-sources.md
@@ -16,7 +16,7 @@ its API exists, `mockData.ts`). This table says which accessor reads from where.
 | Site search     | `searchSite`                                                                                                             | ✅ API (the lists above)            | No search endpoint yet: loads the public lists and matches in the browser, in the visitor's language                                                                   |
 | News categories | —                                                                                                                        | 🟡 API exists, not used             | `GET /api/v1/news/categories`; the list has no category tabs yet                                                                                                       |
 | Recent services | `getRecentServices`                                                                                                      | ⚪ Demo data                        | The mock session's user; per-user — a backend behind the API Gateway                                                                                                   |
-| Profile         | `authService.getSession`                                                                                                 | ✅ Identity Service `GET me`        | The session's user (name, FIN, VÖEN, photo, address, email, phone); the contact details form does not save yet — no endpoint                                           |
+| Profile         | `authService.getSession`                                                                                                 | ✅ Identity Service `GET me`        | The session's user (name, FIN, VÖEN, address, email, phone); the contact details form saves with `authService.updateContact` (`PUT me`)                                |
 | Contact service | `getAppellant`, `getMyAppeals`, `getAppeal`, `getOtherAppeals`, `submitAppeal`                                           | ⚪ Demo data                        | Its own API (`USR_CONTACT`). The service's fixed texts are static (`contact/content.ts`)                                                                               |
 | Credit registry | `getSubject`, `prepareSubject`, `createInquiry`, `getInquiries`, `exportInquiries`, `getInquiryArchive`, `getUserManual` | ⚪ Demo data                        | Its own API (api-accr-portal); archives are report JSON, only the old portal's are `legacyHtml`                                                                        |
 | Session / login | `authService`                                                                                                            | ✅ Identity Service                 | `/api/identity/v1/auth` via the gateway. No profiles yet — one `individual` profile                                                                                    |
diff --git a/src/app/providers/SessionProvider.tsx b/src/app/providers/SessionProvider.tsx
index cdfef5e54fb6fdab5ccc04d8dfd8067d29d4cd92..b07bc60cbc3c8f86a2458d598dfbfbc0a2423ce8 100644
--- a/src/app/providers/SessionProvider.tsx
+++ b/src/app/providers/SessionProvider.tsx
@@ -1,7 +1,7 @@
 import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
 
 import { SessionContext, type SessionEnd, type SessionState } from '@/app/providers/sessionContext'
-import { authService, type UserSession } from '@/services/auth/authService'
+import { authService, type ContactDetails, type UserSession } from '@/services/auth/authService'
 import { onSessionEnd } from '@/shared/api/apiClient'
 import { useAsync } from '@/shared/hooks/useAsync'
 
@@ -20,16 +20,20 @@ export function SessionProvider({ children }: { children: ReactNode }) {
   useEffect(() => onSessionEnd((reason) => setEnded({ reason })), [])
 
   const loaded = useAsync(() => authService.getSession(), [])
-  // A profile switch returns the re-scoped session; it replaces the loaded one.
-  const [switched, setSwitched] = useState<UserSession>()
+  // A profile switch and a contact update return the new session; it replaces the loaded one.
+  const [replaced, setReplaced] = useState<UserSession>()
 
   const switchProfile = useCallback(async (profileId: string) => {
-    setSwitched(await authService.switchProfile(profileId))
+    setReplaced(await authService.switchProfile(profileId))
+  }, [])
+
+  const updateContact = useCallback(async (contact: ContactDetails) => {
+    setReplaced(await authService.updateContact(contact))
   }, [])
 
   const value = useMemo<SessionState>(
-    () => ({ ...loaded, data: switched ?? loaded.data, switchProfile, ended }),
-    [loaded, switched, switchProfile, ended],
+    () => ({ ...loaded, data: replaced ?? loaded.data, switchProfile, updateContact, ended }),
+    [loaded, replaced, switchProfile, updateContact, ended],
   )
 
   return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
diff --git a/src/app/providers/sessionContext.ts b/src/app/providers/sessionContext.ts
index d50e9010d01042d4efc6fe3fd5d2dad5b6fa3b04..2ea1047f8c910898b76f1350a4f0f59caf900ddb 100644
--- a/src/app/providers/sessionContext.ts
+++ b/src/app/providers/sessionContext.ts
@@ -1,6 +1,11 @@
 import { createContext, useContext } from 'react'
 
-import { activeProfileOf, type SessionProfile, type UserSession } from '@/services/auth/authService'
+import {
+  activeProfileOf,
+  type ContactDetails,
+  type SessionProfile,
+  type UserSession,
+} from '@/services/auth/authService'
 import type { AsyncState } from '@/shared/hooks/useAsync'
 
 /**
@@ -14,6 +19,7 @@ export interface SessionEnd {
 /** `data: null` means "resolved, and there is no session" — distinct from loading. */
 export type SessionState = AsyncState<UserSession | null> & {
   switchProfile: (profileId: string) => Promise<void>
+  updateContact: (contact: ContactDetails) => Promise<void>
   /** Set once a refresh fails, whether at load or in the middle of the user's work. */
   ended: SessionEnd | undefined
 }
diff --git a/src/features/profile/ProfilePage.tsx b/src/features/profile/ProfilePage.tsx
index 503c74aa9d5a06096c72d0414aaf2a477568807f..4fd3abd421f8780ba21164ea5e603f9432cb84d4 100644
--- a/src/features/profile/ProfilePage.tsx
+++ b/src/features/profile/ProfilePage.tsx
@@ -3,15 +3,17 @@ import { Button } from '@cbar/lib-react-ui-kit/button'
 import { Card, CardContent, CardHeader, CardTitle } from '@cbar/lib-react-ui-kit/card'
 import { BankIcon, EnvelopeIcon, UserIcon } from '@cbar/lib-react-ui-kit/icons'
 import type { CbarIconProps } from '@cbar/lib-react-ui-kit/icons'
-import { Field, FieldDescription, FieldLabel } from '@cbar/lib-react-ui-kit/field'
+import { Field, FieldDescription, FieldError, FieldLabel } from '@cbar/lib-react-ui-kit/field'
 import { Input } from '@cbar/lib-react-ui-kit/input'
-import { useId, useState, type ComponentType, type ReactNode } from 'react'
+import { toast } from '@cbar/lib-react-ui-kit/toast'
+import { useId, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
 import { useTranslation } from 'react-i18next'
 
 import { useSession } from '@/app/providers/sessionContext'
 import { CabinetPageHeader } from '@/features/cabinet/CabinetPageHeader'
 import { ProfileSwitcher } from '@/features/cabinet/ProfileSwitcher'
 import { activeProfileOf, type UserSession } from '@/services/auth/authService'
+import { ApiError } from '@/shared/api/apiClient'
 import { initialsOf, maskFin } from '@/shared/lib/format'
 
 interface ReadOnlyFieldProps {
@@ -21,8 +23,9 @@ interface ReadOnlyFieldProps {
 }
 
 /**
- * A profile row. `readOnly` rather than `disabled`: the value still takes focus
- * and can be copied, which is the whole point of showing it.
+ * A profile row. `readOnly` rather than `disabled`: the value stays fully legible and
+ * can be selected and copied. Muted, out of the tab order and without the focus
+ * ring or caret, so it does not read as a field to fill in.
  */
 function ReadOnlyField({ label, value, hint }: ReadOnlyFieldProps) {
   const id = useId()
@@ -30,7 +33,14 @@ function ReadOnlyField({ label, value, hint }: ReadOnlyFieldProps) {
   return (
     <Field>
       <FieldLabel htmlFor={id}>{label}</FieldLabel>
-      <Input id={id} value={value} readOnly aria-readonly="true" />
+      <Input
+        id={id}
+        value={value}
+        readOnly
+        aria-readonly="true"
+        tabIndex={-1}
+        className="bg-muted dark:bg-muted focus-visible:border-input cursor-default caret-transparent focus-visible:ring-0"
+      />
       {hint ? <FieldDescription>{hint}</FieldDescription> : null}
     </Field>
   )
@@ -61,44 +71,90 @@ function ProfileSection({
   )
 }
 
+type ContactField = 'email' | 'phone'
+
 /**
- * The contact details the person keeps themself, as `GET me` has them (`email`,
- * `phoneNumber`). Editable, unlike the mygov identity above; saving waits for the
- * Identity Service's edit endpoint, so the button stays disabled until it is wired.
+ * The contact details the person keeps themself, as `GET me` has them (`contact`).
+ * Editable, unlike the mygov identity above; saved with the Identity Service's `PUT me`.
  */
 function ContactForm({ user }: { user: UserSession['user'] }) {
   const { t } = useTranslation()
+  const { updateContact } = useSession()
   const emailId = useId()
   const phoneId = useId()
   const [email, setEmail] = useState(user.email ?? '')
   const [phone, setPhone] = useState(user.phone ?? '')
+  const [isSaving, setIsSaving] = useState(false)
+  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({})
+
+  const contact = { email: email.trim(), phone: phone.trim() }
+  const changed = contact.email !== (user.email ?? '') || contact.phone !== (user.phone ?? '')
+
+  /** `PUT me`'s per-field codes in the reader's language, most specific wording first. */
+  function fieldErrorsOf(error: unknown): Partial<Record<ContactField, string>> {
+    if (!(error instanceof ApiError)) return {}
+    return Object.fromEntries(
+      error.errors
+        .filter(({ field }) => field === 'email' || field === 'phone')
+        .map(({ field, code }) => [
+          field,
+          t([
+            `cabinet.profile.errors.${field}_${code}`,
+            `cabinet.profile.errors.${code}`,
+            'cabinet.profile.errors.invalid',
+          ]),
+        ]),
+    )
+  }
+
+  function handleSubmit(event: FormEvent<HTMLFormElement>) {
+    event.preventDefault()
+    setErrors({})
+    setIsSaving(true)
+    void updateContact(contact)
+      .then(
+        () => toast.success(t('cabinet.profile.saved')),
+        (error: unknown) => {
+          const fieldErrors = fieldErrorsOf(error)
+          setErrors(fieldErrors)
+          if (Object.keys(fieldErrors).length === 0) toast.error(t('common.errorRetry'))
+        },
+      )
+      .finally(() => setIsSaving(false))
+  }
 
   return (
-    <form onSubmit={(event) => event.preventDefault()} noValidate className="space-y-4">
-      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
-        <Field>
+    <form onSubmit={handleSubmit} noValidate className="space-y-4">
+      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
+        <Field invalid={Boolean(errors.email)}>
           <FieldLabel htmlFor={emailId}>{t('cabinet.profile.email')}</FieldLabel>
           <Input
             id={emailId}
             type="email"
             autoComplete="email"
             value={email}
+            aria-invalid={errors.email ? true : undefined}
+            aria-describedby={errors.email ? `${emailId}-error` : undefined}
             onChange={(event) => setEmail(event.target.value)}
           />
+          {errors.email ? <FieldError id={`${emailId}-error`}>{errors.email}</FieldError> : null}
         </Field>
-        <Field>
+        <Field invalid={Boolean(errors.phone)}>
           <FieldLabel htmlFor={phoneId}>{t('cabinet.profile.phone')}</FieldLabel>
           <Input
             id={phoneId}
             type="tel"
             autoComplete="tel"
-            inputMode="numeric"
+            placeholder="+994XXXXXXXXX"
             value={phone}
+            aria-invalid={errors.phone ? true : undefined}
+            aria-describedby={errors.phone ? `${phoneId}-error` : undefined}
             onChange={(event) => setPhone(event.target.value)}
           />
+          {errors.phone ? <FieldError id={`${phoneId}-error`}>{errors.phone}</FieldError> : null}
         </Field>
       </div>
-      <Button type="submit" disabled>
+      <Button type="submit" disabled={!changed || isSaving}>
         {t('cabinet.profile.save')}
       </Button>
     </form>
diff --git a/src/locales/az/common.json b/src/locales/az/common.json
index eb64d756db14ff3e0bc2f5711600d2f7a5bbb741..48a9e9b1e37d42eb272a09c7545a6a83c5163803 100644
--- a/src/locales/az/common.json
+++ b/src/locales/az/common.json
@@ -158,6 +158,13 @@
       "email": "E-poçt",
       "phone": "Telefon",
       "save": "Yadda saxla",
+      "saved": "Əlaqə məlumatları yadda saxlanıldı",
+      "errors": {
+        "phone_invalid_format": "Telefon +994XXXXXXXXX formatında olmalıdır",
+        "email_invalid_format": "E-poçt ünvanını düzgün daxil edin",
+        "required": "Bu sahə mütləqdir",
+        "invalid": "Dəyəri yoxlayın"
+      },
       "organization": "Təşkilat",
       "address": "Ünvan",
       "fin": "FİN",
diff --git a/src/locales/en/common.json b/src/locales/en/common.json
index 48c3727c885245f46ba04979020114eb50e7be81..814b8073248c5300f591ebc839a5c6aa630bbeb1 100644
--- a/src/locales/en/common.json
+++ b/src/locales/en/common.json
@@ -158,6 +158,13 @@
       "email": "Email",
       "phone": "Phone",
       "save": "Save",
+      "saved": "Contact details saved",
+      "errors": {
+        "phone_invalid_format": "The phone must be in the +994XXXXXXXXX format",
+        "email_invalid_format": "Enter a valid email address",
+        "required": "This field is required",
+        "invalid": "Check this value"
+      },
       "organization": "Organisation",
       "address": "Address",
       "fin": "PIN",
diff --git a/src/services/auth/authService.ts b/src/services/auth/authService.ts
index ecdff15c40bdbcf3215291c310088a19672cf524..ed6557931e672debea969785ee386f3a55230baa 100644
--- a/src/services/auth/authService.ts
+++ b/src/services/auth/authService.ts
@@ -63,6 +63,12 @@ export interface UserSession {
   permissions?: string[]
 }
 
+/** The contact details the person edits on the profile page; `''` clears one. */
+export interface ContactDetails {
+  email: string
+  phone: string
+}
+
 /** What mygov ID sends back to the redirect URI. */
 export interface MygovCallback {
   code: string
@@ -89,6 +95,8 @@ export interface AuthService {
    * session, the browser only learns the result.
    */
   switchProfile(profileId: string): Promise<UserSession>
+  /** Saves the person's own contact details; resolves to the session with them. */
+  updateContact(contact: ContactDetails): Promise<UserSession>
   logout(): Promise<void>
 }
 
@@ -112,5 +120,6 @@ export const authService: AuthService = {
   login: (returnTo) => current().login(returnTo),
   completeLogin: (callback) => current().completeLogin(callback),
   switchProfile: (profileId) => current().switchProfile(profileId),
+  updateContact: (contact) => current().updateContact(contact),
   logout: () => current().logout(),
 }
diff --git a/src/services/auth/mockAuthService.ts b/src/services/auth/mockAuthService.ts
index 83ca31527689af01e650fb90573d2026161c8206..4d25e747de82606b1865838360179099e2965b04 100644
--- a/src/services/auth/mockAuthService.ts
+++ b/src/services/auth/mockAuthService.ts
@@ -84,6 +84,12 @@ export const mockAuthService: AuthService = {
     return Promise.resolve(session)
   },
 
+  updateContact(contact) {
+    if (!session) return Promise.reject(new Error('No active session'))
+    session = { ...session, user: { ...session.user, ...contact } }
+    return Promise.resolve(session)
+  },
+
   logout() {
     session = null
     writeDemoFlag(false)
diff --git a/src/services/auth/mygovAuthService.ts b/src/services/auth/mygovAuthService.ts
index 45a97fd35513a340d933830c3d7e01995290009a..5205a49daec71046523065463993d1e27f8cc7d8 100644
--- a/src/services/auth/mygovAuthService.ts
+++ b/src/services/auth/mygovAuthService.ts
@@ -1,4 +1,4 @@
-import { ApiError, apiGet, apiPost } from '@/shared/api/apiClient'
+import { ApiError, apiGet, apiPost, apiPut } from '@/shared/api/apiClient'
 import { getAppConfig } from '@/shared/config/appConfig'
 
 import type { AuthService, UserSession } from './authService'
@@ -23,32 +23,34 @@ import type { AuthService, UserSession } from './authService'
  * header and refreshes on 401 (flow E).
  *
  * Paths and bodies follow the Identity Service's swagger and live only in this file;
- * `toUserSession` maps `GET me` onto the app's session model.
+ * `toUserSession` maps `GET me` onto the app's session model. `PUT me { email, phone }`
+ * saves the person's contact details and answers with the same body.
  */
 
-/** `GET me` (swagger `MeResponse`); the session timings are not used yet. */
+/**
+ * `GET me` and `PUT me` (swagger `MeResponse`), the fields the app uses; the session
+ * timings and the rest of the mygov identity are not used yet.
+ */
 interface MeResponse {
   user: {
     id: number
-    name: string | null
-    fin: string | null
-    tin: string | null
-    email?: string | null
-    phoneNumber?: string | null
-    /** Base64 JPEG, without a `data:` prefix. */
-    image?: string | null
+    fin?: string | null
+    tin?: string | null
+    firstName?: string | null
+    lastName?: string | null
     address?: string | null
+    contact?: { phone?: string | null; email?: string | null } | null
+    permissions?: string[] | null
   }
-  permissions?: string[] | null
 }
 
 /**
  * The Identity Service has no profiles yet, so the session is the person alone:
  * one `individual` profile. Legal-entity profiles come when the service sends them.
  */
-function toUserSession({ user, permissions }: MeResponse): UserSession {
+function toUserSession({ user }: MeResponse): UserSession {
   const id = String(user.id)
-  const name = user.name ?? ''
+  const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
   return {
     authenticated: true,
     user: {
@@ -56,14 +58,13 @@ function toUserSession({ user, permissions }: MeResponse): UserSession {
       displayName: name,
       ...(user.fin ? { fin: user.fin } : {}),
       ...(user.tin ? { tin: user.tin } : {}),
-      email: user.email ?? '',
-      phone: user.phoneNumber ?? '',
-      ...(user.image ? { photo: `data:image/jpeg;base64,${user.image}` } : {}),
+      email: user.contact?.email ?? '',
+      phone: user.contact?.phone ?? '',
       ...(user.address ? { address: user.address } : {}),
     },
     profiles: [{ id, kind: 'individual', name }],
     activeProfileId: id,
-    ...(permissions ? { permissions } : {}),
+    ...(user.permissions ? { permissions: user.permissions } : {}),
   }
 }
 
@@ -104,6 +105,16 @@ export const mygovAuthService: AuthService = {
     return returnUrl ?? ''
   },
 
+  async updateContact({ email, phone }) {
+    return toUserSession(
+      await apiPut<MeResponse>(
+        'me',
+        { email: email || null, phone: phone || null },
+        identityBaseUrl(),
+      ),
+    )
+  },
+
   // Not in the Identity Service yet (a single profile, so the cabinet never calls it):
   // the proposal is that the service re-issues the session for the chosen profile.
   switchProfile(profileId) {
diff --git a/src/services/auth/unavailableAuthService.ts b/src/services/auth/unavailableAuthService.ts
index d3db8a68a977836fc1e9d916191a1a234e9a4d8d..57fc2b5977bd3cb043642cfc389b3c9168e1e253 100644
--- a/src/services/auth/unavailableAuthService.ts
+++ b/src/services/auth/unavailableAuthService.ts
@@ -11,5 +11,6 @@ export const unavailableAuthService: AuthService = {
   login: notConfigured,
   completeLogin: notConfigured,
   switchProfile: notConfigured,
+  updateContact: notConfigured,
   logout: () => Promise.resolve(),
 }
diff --git a/src/shared/api/apiClient.ts b/src/shared/api/apiClient.ts
index 009eb80b5d94a50842ff285ff490979aa9025147..9cba0e833caaa262b1a78d85fc7ef7780aa34dbe 100644
--- a/src/shared/api/apiClient.ts
+++ b/src/shared/api/apiClient.ts
@@ -174,15 +174,24 @@ export function apiGet<T>(path: string, query?: Query, base?: string): Promise<T
   return request<T>(apiUrl(path, query, base))
 }
 
-/** POST a JSON body to `<base>/<path>`; same-origin calls carry the XSRF header. */
-export function apiPost<T>(path: string, body: unknown, base?: string): Promise<T> {
+function write<T>(method: string, path: string, body: unknown, base?: string): Promise<T> {
   return request<T>(apiUrl(path, {}, base), {
-    method: 'POST',
+    method,
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(body),
   })
 }
 
+/** POST a JSON body to `<base>/<path>`; same-origin calls carry the XSRF header. */
+export function apiPost<T>(path: string, body: unknown, base?: string): Promise<T> {
+  return write<T>('POST', path, body, base)
+}
+
+/** PUT a JSON body to `<base>/<path>`; same-origin calls carry the XSRF header. */
+export function apiPut<T>(path: string, body: unknown, base?: string): Promise<T> {
+  return write<T>('PUT', path, body, base)
+}
+
 /** `apiGet`, but a 404 means "no such item" rather than an error. */
 export async function apiGetOptional<T>(path: string, query?: Query): Promise<T | undefined> {
   try {
diff --git a/src/test/mygovLogin.test.tsx b/src/test/mygovLogin.test.tsx
index 2de23155f1491d3ec640e8339271f57ba058903d..8e40f0887b7d172118805486d039ae0b28b98f78 100644
--- a/src/test/mygovLogin.test.tsx
+++ b/src/test/mygovLogin.test.tsx
@@ -12,11 +12,14 @@ const AUTHORIZE_URL = 'https://mygovid.gov.az/grant-permission?client_id=test&st
 const me = {
   user: {
     id: 42,
-    name: 'Test İstifadəçi',
     fin: '5ABC12D',
     tin: '1234567891',
-    email: '',
-    phoneNumber: '',
+    firstName: 'Test',
+    lastName: 'İstifadəçi',
+    fatherName: 'Rəşid',
+    address: null,
+    contact: { phone: null, email: null },
+    permissions: [],
   },
   session: {
     sid: '3f2b8c1e-7a4d-4e9b-9c61-2d5f0a8e4b17',
@@ -25,7 +28,11 @@ const me = {
     idleExpiresAt: '2026-11-05T08:15:00Z',
     absoluteExpiresAt: '2026-11-05T16:00:00Z',
   },
-  permissions: [],
+}
+
+const withContact = {
+  ...me,
+  user: { ...me.user, contact: { email: 'ali@example.az', phone: '+994501234567' } },
 }
 
 const ok = (body: unknown) => Response.json(body)
@@ -35,11 +42,11 @@ const fail = (status: number) => Response.json({ status, errorCode: 'no' }, { st
  * Stands in for the Identity Service; the content endpoints the cabinet loads go to
  * the fake API. Tests never reach a real API (AGENTS.md §29).
  */
-function identity(routes: Record<string, () => Response>) {
+function identity(routes: Record<string, (init?: RequestInit) => Response>) {
   const fetchMock = vi.fn((input: URL, init?: RequestInit) => {
     const url = new URL(input)
     const route = routes[url.pathname]
-    return route ? Promise.resolve(route()) : fakeApiFetch(input, init)
+    return route ? Promise.resolve(route(init)) : fakeApiFetch(input, init)
   })
   vi.stubGlobal('fetch', fetchMock)
   return fetchMock
@@ -152,31 +159,93 @@ describe('mygov ID login through the Identity Service (flows A, B)', () => {
     expect(screen.getByLabelText('Ünvan')).toHaveValue('')
   })
 
-  it("puts GET me's email and phoneNumber in the editable contact fields", async () => {
-    identity({
-      '/identity/auth/me': () =>
-        ok({ ...me, user: { ...me.user, email: 'ali@example.az', phoneNumber: '994501234567' } }),
+  it("puts GET me's contact in the editable fields and saves a change with PUT me", async () => {
+    const saved = {
+      ...me,
+      user: { ...me.user, contact: { email: 'new@example.az', phone: '+994501234567' } },
+    }
+    const fetchMock = identity({
+      '/identity/auth/me': (init) => ok(init?.method === 'PUT' ? saved : withContact),
     })
     const user = userEvent.setup()
     renderRoute('/az/cabinet/profile')
 
     const email = await screen.findByLabelText('E-poçt')
     expect(email).toHaveValue('ali@example.az')
-    expect(screen.getByLabelText('Telefon')).toHaveValue('994501234567')
+    expect(screen.getByLabelText('Telefon')).toHaveValue('+994501234567')
     expect(screen.getByLabelText('FİN')).toHaveAttribute('readonly')
+    // Read-only values stay out of the tab order, so they do not read as fields to fill in.
+    expect(screen.getByLabelText('FİN')).toHaveAttribute('tabindex', '-1')
     expect(email).not.toHaveAttribute('readonly')
+    expect(email).not.toHaveAttribute('tabindex')
+    // Nothing to save until something changes.
+    const save = screen.getByRole('button', { name: 'Yadda saxla' })
+    expect(save).toBeDisabled()
 
     await user.clear(email)
     await user.type(email, 'new@example.az')
+    await user.click(save)
+
+    expect(await screen.findByText('Əlaqə məlumatları yadda saxlanıldı')).toBeVisible()
+    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!
+    expect(JSON.parse(init?.body as string)).toEqual({
+      email: 'new@example.az',
+      phone: '+994501234567',
+    })
+    // The session now holds what PUT me answered with.
     expect(email).toHaveValue('new@example.az')
-    // No edit endpoint yet: nothing can be saved.
-    expect(screen.getByRole('button', { name: 'Yadda saxla' })).toBeDisabled()
+    expect(save).toBeDisabled()
+  })
+
+  it("words PUT me's validation error under the field it names", async () => {
+    const invalidPhone = Response.json(
+      {
+        status: 400,
+        errorCode: 'validation_error',
+        errors: [
+          { field: 'phone', code: 'invalid_format', message: 'phone must match +994XXXXXXXXX' },
+        ],
+      },
+      { status: 400 },
+    )
+    identity({
+      '/identity/auth/me': (init) => (init?.method === 'PUT' ? invalidPhone : ok(withContact)),
+    })
+    const user = userEvent.setup()
+    renderRoute('/az/cabinet/profile')
+
+    const phone = await screen.findByLabelText('Telefon')
+    await user.clear(phone)
+    await user.type(phone, '0501234567')
+    await user.click(screen.getByRole('button', { name: 'Yadda saxla' }))
+
+    expect(await screen.findByText('Telefon +994XXXXXXXXX formatında olmalıdır')).toBeVisible()
+    expect(phone).toHaveAttribute('aria-invalid', 'true')
+    expect(screen.getByLabelText('E-poçt')).not.toHaveAttribute('aria-invalid')
+    expect(phone).toHaveValue('0501234567')
   })
 
-  it("shows GET me's address, and the initials when there is no image", async () => {
+  it('keeps the typed contact details and says so when PUT me fails', async () => {
+    identity({
+      '/identity/auth/me': (init) => (init?.method === 'PUT' ? fail(500) : ok(withContact)),
+    })
+    const user = userEvent.setup()
+    renderRoute('/az/cabinet/profile')
+
+    const email = await screen.findByLabelText('E-poçt')
+    await user.clear(email)
+    await user.type(email, 'not-an-email')
+    await user.click(screen.getByRole('button', { name: 'Yadda saxla' }))
+
+    expect(await screen.findByText('Yenidən cəhd edin')).toBeVisible()
+    expect(email).toHaveValue('not-an-email')
+    expect(screen.getByRole('button', { name: 'Yadda saxla' })).toBeEnabled()
+  })
+
+  it("shows GET me's address, and the initials when there is no photo", async () => {
     identity({
       '/identity/auth/me': () =>
-        ok({ ...me, user: { ...me.user, address: 'Bakı, Nizami küç. 1', image: null } }),
+        ok({ ...me, user: { ...me.user, address: 'Bakı, Nizami küç. 1' } }),
     })
     renderRoute('/az/cabinet/profile')
 
@@ -199,10 +268,7 @@ describe('mygov ID login through the Identity Service (flows A, B)', () => {
   })
 
   it('opens the appeal form once GET me has an email and a phone', async () => {
-    identity({
-      '/identity/auth/me': () =>
-        ok({ ...me, user: { ...me.user, email: 'ali@example.az', phoneNumber: '994501234567' } }),
-    })
+    identity({ '/identity/auth/me': () => ok(withContact) })
     renderRoute('/az/cabinet/services/contact/new')
 
     expect(await screen.findByRole('button', { name: 'Göndər' })).toBeVisible()
diff --git a/src/test/profileSwitcher.test.tsx b/src/test/profileSwitcher.test.tsx
index f20c800a7a92e0aa127a98bff2c4c20c45029514..d00f765fdc6069eec84882b7e6a0cc9f4d40334b 100644
--- a/src/test/profileSwitcher.test.tsx
+++ b/src/test/profileSwitcher.test.tsx
@@ -31,6 +31,7 @@ describe('profile switcher', () => {
           isLoading: false,
           error: undefined,
           switchProfile,
+          updateContact: () => Promise.resolve(),
           ended: undefined,
         }}
       >