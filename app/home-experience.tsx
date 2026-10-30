"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowDownToLine, ArrowRight, AudioLines, Check, CircleHelp,
  Clapperboard, Film, Focus, ImagePlus, LockKeyhole, Menu, ScanLine,
  ShieldCheck, Sparkles, Upload, Waves, X,
} from "lucide-react";
import { Upload as TusUpload } from "tus-js-client";
import { signInAction, signOutAction, signUpAction, type AuthState } from "@/app/actions";
import { VIDEO_LIMITS, isValidVideoDuration, validateVideoFile } from "@/lib/video/constraints.mjs";

type UploadState = "local" | "uploading" | "inspecting" | "verified" | "deleting" | "error";
type Clip = {
  file: File; url: string; duration: number; width: number; height: number;
  uploadState: UploadState; progress: number; requestId: string | null; uploadId: string | null;
  transferComplete: boolean; message?: string;
  inspected?: { durationSeconds: number; width: number; height: number; videoCodec: string; containerFormat: string };
};
type AccountState = "signed-in" | "signed-out" | "not-configured" | "unavailable";
type StoredUpload = { id: string; createdAt: string; sizeBytes: number; durationSeconds: number; width: number; height: number; videoCodec: string; containerFormat: string };
type HomeExperienceProps = { accountState: AccountState; userEmail: string | null; userId: string | null; authNotice?: string; initialUploads: StoredUpload[]; uploadLibraryReady: boolean };

function uploadIntentStorageKey(userId: string | null, file: File) {
  return userId ? `clariframe-upload:${userId}:${file.name}:${file.size}:${file.lastModified}` : null;
}

const initialAuthState: AuthState = {};

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MiB`;
}

function AuthFeedback({ state }: { state: AuthState }) {
  if (state.error) return <p className="auth-feedback is-error" role="alert">{state.error}</p>;
  if (state.notice) return <p className="auth-feedback is-notice" role="status">{state.notice}</p>;
  return null;
}

function SignInForm() {
  const [state, action, pending] = useActionState(signInAction, initialAuthState);
  return (
    <form action={action} className="account-form">
      <p className="form-index">01 <span>RETURNING MEMBER</span></p>
      <h3>Sign in</h3>
      <label htmlFor="signin-email">Email address</label>
      <input id="signin-email" name="email" type="email" autoComplete="email" maxLength={254} required />
      <label htmlFor="signin-password">Password</label>
      <input id="signin-password" name="password" type="password" autoComplete="current-password" minLength={8} maxLength={128} required />
      <AuthFeedback state={state} />
      <button className="button button-secondary form-submit" type="submit" disabled={pending}>{pending ? "Checking your details…" : "Sign in"}<ArrowRight size={15} /></button>
    </form>
  );
}

function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, initialAuthState);
  return (
    <form action={action} className="account-form">
      <p className="form-index">02 <span>NEW TO CLARIFRAME</span></p>
      <h3>Create an account</h3>
      <label htmlFor="signup-email">Email address</label>
      <input id="signup-email" name="email" type="email" autoComplete="email" maxLength={254} required />
      <label htmlFor="signup-password">Password <span>8–128 characters</span></label>
      <input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      <AuthFeedback state={state} />
      <button className="button button-primary form-submit" type="submit" disabled={pending}>{pending ? "Creating your account…" : "Create account"}<ArrowRight size={15} /></button>
    </form>
  );
}

function AccountSection({ state, email, notice, uploads, libraryReady, onDelete }: { state: AccountState; email: string | null; notice?: string; uploads: StoredUpload[]; libraryReady: boolean; onDelete: (id: string) => void }) {
  return (
    <section className="account-section section-pad" id="account" aria-labelledby="account-title">
      <div className="account-heading" data-reveal>
        <div>
          <p className="eyebrow"><span /> YOUR ACCOUNT</p>
          <h2 id="account-title">A little space<br /><em>of your own.</em></h2>
        </div>
        <p className="section-intro">Verified source uploads require the private-storage setup described below. The AI worker and processing history are still in development.</p>
      </div>
      {notice && <p className="account-banner is-notice" role="status"><Check size={16} />{notice}</p>}
      {state === "signed-in" ? (
        <div className="signed-in-panel" data-reveal>
          <div className="signed-in-mark"><ShieldCheck size={19} /></div>
          <div className="signed-in-copy"><span className="status-overline">SESSION VERIFIED ON SERVER</span><strong>{email ?? "Signed in"}</strong><small>Your account is active. Uploads require private-storage setup; AI processing is not connected yet.</small></div>
          <form action={signOutAction}><button className="button button-secondary" type="submit">Sign out <ArrowRight size={14} /></button></form>
        </div>
      ) : (
        <>
          {state === "unavailable" && <div className="account-banner is-error" role="alert"><CircleHelp size={17} />We couldn’t verify your account session right now. You are not shown as signed in. You can retry signing in below.</div>}
          {state === "not-configured" && <div className="account-banner is-notice" role="status"><LockKeyhole size={16} />Account service is not configured in this environment. Set the Supabase values in <code>.env.local</code> to enable these forms.</div>}
          <div className="account-forms" data-reveal><SignInForm /><SignUpForm /></div>
        </>
      )}
      {state === "signed-in" && <div className="upload-library" aria-labelledby="library-title">
        <div className="upload-library-heading"><div><span className="panel-kicker">PRIVATE SOURCES</span><h3 id="library-title">Your verified uploads</h3></div><span className="mono">{uploads.length} FILE{uploads.length === 1 ? "" : "S"}</span></div>
        {!libraryReady ? <p className="upload-library-empty" role="status">The private upload schema is not available yet. Apply the Supabase migration to enable your library.</p>
        : uploads.length === 0 ? <p className="upload-library-empty">Verified private uploads will appear here.</p>
            : <ul className="upload-library-list">{uploads.map((upload) => <li key={upload.id}>
              <div className="upload-library-meta"><strong>Source video <small className="mono">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(upload.createdAt))}</small></strong><span className="mono">{upload.width} × {upload.height} <i /> {formatDuration(upload.durationSeconds)} <i /> {formatSize(upload.sizeBytes)} <i /> {upload.videoCodec.toUpperCase()}</span></div>
              <button className="replace-link" onClick={() => onDelete(upload.id)} aria-label={`Delete verified source video, ${upload.width} by ${upload.height}, ${formatDuration(upload.durationSeconds)}`}><X size={13} /> Delete</button>
            </li>)}</ul>}
      </div>}
      <p className="account-privacy"><LockKeyhole size={13} /> Supabase handles credentials. The site never stores or logs your password.</p>
    </section>
  );
}

export function HomeExperience({ accountState, userEmail, userId, authNotice, initialUploads, uploadLibraryReady }: HomeExperienceProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<TusUpload | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [storedUploads, setStoredUploads] = useState(initialUploads);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setStoredUploads(initialUploads), [initialUploads]);

  useEffect(() => {
    if (!clip) return;
    const objectUrl = clip.url;
    return () => URL.revokeObjectURL(objectUrl);
  }, [clip?.url]);

  useEffect(() => () => {
    void uploadRef.current?.abort(false);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("motion-ready");
    const elements = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -36px 0px" });
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("motion-ready");
    };
  }, []);

  function validateAndLoad(file?: File) {
    if (!file) return;
    if (clip && ["uploading", "inspecting", "deleting"].includes(clip.uploadState)) {
      setError("Wait for the current private upload operation to finish before choosing another video.");
      return;
    }
    if (clip?.uploadId) {
      setError(clip.uploadState === "verified"
        ? "Remove the verified private video before replacing it, so the stored source is not orphaned."
        : "This private upload is still pending verification or expiry cleanup. Finish its recovery before choosing another video.");
      return;
    }
    setError("");
    const validation = validateVideoFile(file.type, file.size);
    if (validation === "unsupported-type") {
      setError(`Choose an ${VIDEO_LIMITS.formats.map(({ label }) => label).join(", ")} video. The local preview could not verify this file type.`);
      return;
    }
    if (validation === "too-large") {
      setError(`This file exceeds the ${formatSize(VIDEO_LIMITS.maxBytes)} local preview limit. Choose a smaller video.`);
      return;
    }
    if (validation === "invalid-size") {
      setError("This video file is empty or could not be measured. Choose another clip.");
      return;
    }

    const intentKey = uploadIntentStorageKey(userId, file);
    let rememberedRequestId: string | null = null;
    if (intentKey) {
      try {
        const stored = localStorage.getItem(intentKey);
        if (stored && /^[0-9a-f-]{36}$/i.test(stored)) rememberedRequestId = stored;
      } catch {
        // Browser storage may be disabled; in-memory upload still works.
      }
    }

    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      if (!isValidVideoDuration(probe.duration)) {
        URL.revokeObjectURL(url);
        setError(`Videos must be ${VIDEO_LIMITS.maxDurationSeconds} seconds or shorter. Choose another clip to continue.`);
        return;
      }
      setClip({ file, url, duration: probe.duration, width: probe.videoWidth, height: probe.videoHeight, uploadState: "local", progress: 0, requestId: rememberedRequestId, uploadId: null, transferComplete: false });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setError("We couldn’t read this video in your browser. Try a supported MP4, MOV, or WebM file.");
    };
    probe.src = url;
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    validateAndLoad(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    validateAndLoad(event.dataTransfer.files[0]);
  }

  function clearClip() {
    if (clip?.uploadId && clip.uploadState !== "verified") {
      setError("This private upload is not verified yet. Clearing the preview leaves it private until scheduled expiry cleanup.");
      setClip(null);
      return;
    }
    if (clip?.uploadId) {
      void removeVerifiedUpload(clip.uploadId);
      return;
    }
    setClip(null);
    setError("");
  }

  async function completePrivateUpload(uploadId: string) {
    setClip((current) => current ? { ...current, uploadState: "inspecting", progress: 100, message: "Upload complete. Verifying the stored video on the server…" } : current);
    try {
      const response = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ uploadId }),
      });
      const result = await response.json() as {
        error?: string; sizeBytes?: number; durationSeconds?: number; width?: number; height?: number;
        videoCodec?: string; containerFormat?: string;
      };
      if (!response.ok) {
        if (response.status === 422 && clip) {
          const intentKey = uploadIntentStorageKey(userId, clip.file);
          if (intentKey) try { localStorage.removeItem(intentKey); } catch { /* Invalid uploads remain rejected server-side. */ }
        }
        setClip((current) => current ? {
          ...current,
          uploadState: "error",
          transferComplete: response.status !== 422,
          requestId: response.status === 422 ? null : current.requestId,
          uploadId: response.status === 422 ? null : current.uploadId,
          message: result.error ?? "Server-side video verification failed. Retry in a moment.",
        } : current);
        return;
      }
      setClip((current) => current ? {
        ...current,
        uploadState: "verified",
        transferComplete: true,
        progress: 100,
        message: "Stored privately and verified by the server. AI enhancement is not connected yet.",
        inspected: {
          durationSeconds: result.durationSeconds ?? current.duration,
          width: result.width ?? current.width,
          height: result.height ?? current.height,
          videoCodec: result.videoCodec ?? "verified",
          containerFormat: result.containerFormat ?? "verified",
        },
      } : current);
      setStoredUploads((current) => [{
        id: uploadId,
        createdAt: new Date().toISOString(),
        sizeBytes: result.sizeBytes ?? clip?.file.size ?? 0,
        durationSeconds: result.durationSeconds ?? clip?.duration ?? 0,
        width: result.width ?? clip?.width ?? 0,
        height: result.height ?? clip?.height ?? 0,
        videoCodec: result.videoCodec ?? "verified",
        containerFormat: result.containerFormat ?? "verified",
      }, ...current.filter((upload) => upload.id !== uploadId)]);
      if (clip) {
        const intentKey = uploadIntentStorageKey(userId, clip.file);
        if (intentKey) try { localStorage.removeItem(intentKey); } catch { /* The server record remains authoritative. */ }
      }
      router.refresh();
    } catch {
      setClip((current) => current ? { ...current, uploadState: "error", transferComplete: true, message: "The private upload finished, but the server could not be reached to verify it. Retry verification." } : current);
    }
  }

  async function startPrivateUpload() {
    if (!clip || accountState !== "signed-in" || clip.uploadState === "uploading" || clip.uploadState === "inspecting" || clip.uploadState === "deleting") return;
    setError("");
    const requestId = clip.requestId ?? crypto.randomUUID();
    const intentKey = uploadIntentStorageKey(userId, clip.file);
    if (intentKey) try { localStorage.setItem(intentKey, requestId); } catch { /* In-memory retries remain available. */ }
    if (clip.transferComplete && clip.uploadId) {
      await completePrivateUpload(clip.uploadId);
      return;
    }

    setClip((current) => current ? { ...current, requestId, uploadState: "uploading", progress: 0, message: "Preparing a private upload…" } : current);
    try {
      const intentResponse = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ requestId, sizeBytes: clip.file.size, mimeType: clip.file.type }),
      });
      const intent = await intentResponse.json() as { error?: string; uploadId?: string; bucket?: string; objectPath?: string; token?: string; endpoint?: string; alreadyUploaded?: boolean };
      if (!intentResponse.ok || !intent.uploadId) {
        throw new Error(intent.error ?? "A private upload could not be prepared.");
      }
      setClip((current) => current ? { ...current, uploadId: intent.uploadId!, message: "Uploading to private storage…" } : current);
      if (intent.alreadyUploaded) {
        setClip((current) => current ? { ...current, transferComplete: true, uploadState: "inspecting", message: "Upload already complete. Resuming server verification…" } : current);
        await completePrivateUpload(intent.uploadId);
        return;
      }
      if (!intent.objectPath || !intent.token || !intent.endpoint) throw new Error("A private upload could not be prepared.");
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!publishableKey) throw new Error("Private uploads are not configured in this environment.");

      const tusUpload = new TusUpload(clip.file, {
        endpoint: intent.endpoint,
        fingerprint: (file) => Promise.resolve(`clariframe:${userId}:${requestId}:${file.size}:${file.lastModified}`),
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { apikey: publishableKey, "x-signature": intent.token, "x-upsert": "false" },
        metadata: {
          bucketName: intent.bucket ?? "clariframe-private",
          objectName: intent.objectPath,
          contentType: "application/octet-stream",
          cacheControl: "3600",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        onProgress(bytesUploaded, bytesTotal) {
          setClip((current) => current ? { ...current, progress: bytesTotal ? Math.floor((bytesUploaded / bytesTotal) * 100) : 0 } : current);
        },
        onError() {
          uploadRef.current = null;
          setClip((current) => current ? { ...current, uploadState: "error", transferComplete: false, message: "The upload was interrupted. Retry to resume it or choose another file." } : current);
        },
        onSuccess() {
          uploadRef.current = null;
          setClip((current) => current ? { ...current, transferComplete: true, uploadState: "inspecting", progress: 100 } : current);
          void completePrivateUpload(intent.uploadId!);
        },
      });
      uploadRef.current = tusUpload;
      const previousUploads = await tusUpload.findPreviousUploads();
      if (previousUploads.length) tusUpload.resumeFromPreviousUpload(previousUploads[0]);
      tusUpload.start();
    } catch (uploadError) {
      setClip((current) => current ? {
        ...current,
        uploadState: "error",
        message: uploadError instanceof Error ? uploadError.message : "The private upload could not be started.",
      } : current);
    }
  }

  async function removeVerifiedUpload(uploadId: string) {
    if (!window.confirm("Remove this verified video from private storage? This cannot be undone.")) return;
    setClip((current) => current ? { ...current, uploadState: "deleting", message: "Removing the private video…" } : current);
    try {
      const response = await fetch("/api/uploads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ uploadId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setClip((current) => current ? { ...current, uploadState: "verified" } : current);
        setError(result.error ?? "The private video could not be removed. Try again.");
        return;
      }
      setClip(null);
      setStoredUploads((current) => current.filter((upload) => upload.id !== uploadId));
      router.refresh();
      setError("");
    } catch {
      setClip((current) => current ? { ...current, uploadState: "verified" } : current);
      setError("The private video could not be removed. Check your connection and try again.");
    }
  }

  async function removeLibraryUpload(uploadId: string) {
    if (!window.confirm("Remove this verified video from private storage? This cannot be undone.")) return;
    try {
      const response = await fetch("/api/uploads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ uploadId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "The private video could not be removed. Try again.");
        return;
      }
      setStoredUploads((current) => current.filter((upload) => upload.id !== uploadId));
      router.refresh();
    } catch {
      setError("The private video could not be removed. Check your connection and try again.");
    }
  }

  const nav = (mobile = false) => <>
    <a href="#studio" onClick={() => mobile && setMobileOpen(false)}>The studio</a>
    <a href="#approach" onClick={() => mobile && setMobileOpen(false)}>Our approach</a>
    <a href="#finishing-room" onClick={() => mobile && setMobileOpen(false)}>Finishing room</a>
    <a href="#privacy" onClick={() => mobile && setMobileOpen(false)}>Privacy</a>
  </>;

  const acceptedText = VIDEO_LIMITS.formats.map(({ label }) => label).join(" · ");

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ClariFrame home"><span className="brand-mark"><span /></span><span>clari<span className="brand-light">frame</span></span></a>
        <nav className="desktop-nav" aria-label="Main navigation">{nav()}</nav>
        <div className="topbar-right">
          <span className="engine-indicator"><span /> AI ENGINE OFFLINE</span>
          <a className="nav-cta" href="#account">{accountState === "signed-in" ? "Your account" : "Sign in to studio"}<ArrowRight size={14} /></a>
        </div>
        <button className="mobile-menu" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
        {mobileOpen && <nav className="mobile-nav" aria-label="Mobile navigation">{nav(true)}<a href="#account" onClick={() => setMobileOpen(false)}>Sign in to studio <ArrowRight size={14} /></a></nav>}
      </header>

      <section className="hero section-pad" id="top">
        <div className="hero-copy" data-reveal>
          <p className="eyebrow"><span /> A QUIETER KIND OF VIDEO ENHANCEMENT</p>
          <h1><span className="headline-mask"><span className="headline-line">A little more life</span></span><span className="headline-mask"><span className="headline-line">in every <em>frame.</em></span></span></h1>
          <p className="hero-lede">ClariFrame AI is designed to enhance supported videos up to 60 seconds with genuine AI processing, when the enhancement engine is configured and operational.</p>
          <div className="hero-actions"><a className="button button-primary" href="#studio">Bring in a video <ArrowDown size={15} /></a><a className="text-link" href="#account">Sign in to studio <ArrowRight size={14} /></a></div>
          <div className="hero-footnote"><span className="status-dot" /> Local preview today <span className="footnote-divider">/</span> private AI processing in development</div>
        </div>
        <div className="hero-art" data-reveal aria-label="Illustrative landscape frame. Not an enhancement result.">
          <div className="art-topline"><span>FIELD NOTES&nbsp; / &nbsp;NO. 01</span><span>ILLUSTRATION&nbsp; · &nbsp;NOT OUTPUT</span></div>
          <div className="landscape"><div className="land-sun" /><div className="land-cloud cloud-one" /><div className="land-cloud cloud-two" /><div className="mountain mountain-back" /><div className="mountain mountain-front" /><div className="meadow" /><div className="grain" /><div className="frame-caption"><span>THE LAST LIGHT</span><span>AN EVERYDAY MOMENT</span></div><span className="frame-crosshair" /></div>
          <div className="art-footer"><span><span className="mini-dot" /> A moment, kept in motion</span><span>CF—001</span></div>
          <span className="art-index">CLARIFRAME / 001</span>
        </div>
        <a className="scroll-cue" href="#studio" aria-label="Scroll to the studio"><span>SCROLL TO BEGIN</span><ArrowDown size={14} /></a>
      </section>

      <section className="manifesto-strip" id="approach" aria-label="Product approach">
        <div><span className="strip-icon"><Focus size={17} /></span><span><strong>Thoughtful by design</strong><small>Inspect source before accepting it</small></span></div>
        <span className="strip-rule" />
        <div><span className="strip-icon"><AudioLines size={17} /></span><span><strong>Made for moving images</strong><small>Short clips, inspected before anything else</small></span></div>
        <span className="strip-rule" />
        <div><span className="strip-icon"><LockKeyhole size={16} /></span><span><strong>Private by intention</strong><small>Owner-scoped, server-verified uploads</small></span></div>
      </section>

      <section className="studio-section section-pad" id="studio" aria-labelledby="studio-title">
        <div className="section-heading" data-reveal><div><p className="eyebrow"><span /> YOUR WORKSPACE</p><h2 id="studio-title">Start with a <em>moment.</em></h2></div><p className="section-intro">Preview a clip locally, then choose to send it to private storage. Uploads are checked by the server; AI enhancement is not connected yet.</p></div>
        <div className="studio-grid">
          <div className="upload-column" data-reveal>
            <div className={`dropzone ${dragging ? "is-dragging" : ""} ${clip ? "has-clip" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={onDrop}>
              <input ref={inputRef} className="visually-hidden" type="file" accept={VIDEO_LIMITS.formats.map(({ mime }) => mime).join(",")} onChange={onInputChange} aria-label="Choose a video file" />
              {clip ? <div className="clip-preview">
                <div className="preview-meta"><span><span className={`live-dot ${clip.uploadState === "verified" ? "is-verified" : ""}`} /> {clip.uploadState === "verified" ? "SERVER VERIFIED" : clip.uploadState === "uploading" ? "UPLOADING" : clip.uploadState === "inspecting" ? "SERVER INSPECTION" : clip.uploadState === "deleting" ? "REMOVING" : "LOCAL PREVIEW"}</span><span className="mono">{clip.uploadState === "verified" ? "PRIVATE STORAGE" : clip.uploadId ? "PRIVATE INTENT" : "NOT SENT"}</span></div>
                <div className="preview-frame"><video className="preview-video" src={clip.url} controls playsInline preload="metadata" aria-label={`Preview of ${clip.file.name}`} /><span className="preview-scanline" aria-hidden="true" /></div>
                <div className="clip-title"><div><span className="file-kicker"><Film size={12} /> SOURCE CLIP</span><strong title={clip.file.name}>{clip.file.name}</strong></div><button className="icon-button" onClick={clearClip} disabled={clip.uploadState === "uploading" || clip.uploadState === "inspecting" || clip.uploadState === "deleting"} aria-label={clip.uploadId ? "Remove video from private storage" : "Remove selected video"}><X size={17} /></button></div>
                <div className="metadata-row mono"><span>{clip.inspected?.width ?? clip.width} × {clip.inspected?.height ?? clip.height}</span><i /><span>{formatDuration(clip.inspected?.durationSeconds ?? clip.duration)}</span><i /><span>{formatSize(clip.file.size)}</span><i /><span>{clip.inspected?.videoCodec ?? clip.file.type.split("/")[1]?.toUpperCase()}</span></div>
                {(clip.uploadState === "uploading" || clip.uploadState === "inspecting") && <div className="upload-progress" role="status" aria-live="polite"><div className="upload-progress-copy"><span>{clip.uploadState === "uploading" ? "Private upload" : "Server inspection"}</span><span className="mono">{clip.uploadState === "uploading" ? `${clip.progress}%` : "IN PROGRESS"}</span></div><progress value={clip.uploadState === "uploading" ? clip.progress : undefined} max="100" aria-label={clip.uploadState === "uploading" ? `Upload ${clip.progress}% complete` : "Server video inspection in progress"} /></div>}
                {clip.message && <p className={`upload-result ${clip.uploadState === "error" ? "is-error" : clip.uploadState === "verified" ? "is-success" : ""}`} role={clip.uploadState === "error" ? "alert" : "status"}>{clip.message}</p>}
                <div className="clip-actions">
                  {accountState === "signed-in" && clip.uploadState !== "verified" && clip.uploadState !== "deleting" && <button className="button button-primary" onClick={() => void startPrivateUpload()} disabled={clip.uploadState === "uploading" || clip.uploadState === "inspecting"}>{clip.uploadState === "error" ? clip.transferComplete ? "Retry server inspection" : "Retry private upload" : "Upload privately"}<ArrowRight size={14} /></button>}
                  {clip.uploadState === "verified" && <span className="upload-verified-label"><Check size={13} /> PRIVATE &amp; VERIFIED</span>}
                  {accountState !== "signed-in" && clip.uploadState === "local" && <a className="replace-link" href="#account"><LockKeyhole size={13} /> Sign in to upload privately</a>}
                  {clip.uploadState !== "uploading" && clip.uploadState !== "inspecting" && clip.uploadState !== "deleting" && <button className="replace-link" onClick={() => inputRef.current?.click()}><Upload size={13} /> Replace source</button>}
                </div>
              </div> : <div className="upload-prompt">
                <div className="upload-icon"><ImagePlus size={23} strokeWidth={1.4} /></div><span className="upload-overline">A PLACE FOR YOUR VIDEO</span><h3>Drop a clip to begin</h3>
                <p>{acceptedText} <span>·</span> up to {VIDEO_LIMITS.maxDurationSeconds} seconds <span>·</span> {formatSize(VIDEO_LIMITS.maxBytes)} max file size</p>
                <button className="button button-secondary" onClick={() => inputRef.current?.click()}><Upload size={14} /> Choose a video</button>
                <span className="upload-assurance"><LockKeyhole size={12} /> Local preview <span>·</span> sign in to upload privately</span>
              </div>}
            </div>
            {error && <div className="inline-error" role="alert"><CircleHelp size={16} /><span>{error}</span></div>}
            <div className="below-note"><span className="note-symbol">i</span><span><strong>Server inspection before acceptance</strong> Uploads stay in private storage until FFprobe verifies the actual media container, streams, codecs, size, and duration. No AI job is created.</span></div>
          </div>

          <aside className="engine-panel" aria-labelledby="engine-title" data-reveal>
            <div className="engine-panel-head"><div><span className="panel-kicker">01&nbsp; / &nbsp;PREPARE</span><h3 id="engine-title">Enhancement engine</h3></div><span className="engine-pill"><i /> NOT CONNECTED</span></div>
            <div className="engine-panel-body">
              <div className="engine-emblem"><ScanLine size={22} strokeWidth={1.4} /><span className="emblem-ring" /></div>
              <p className="engine-title">Your source stays<br /><em>untouched.</em></p>
              <p className="engine-description">There is no AI model or worker connected yet. No enhancement settings are offered until a real processing pipeline is ready.</p>
              <div className="engine-facts"><div><span>MODEL</span><strong>Not configured</strong></div><div><span>UPLOAD</span><strong>Requires setup</strong></div><div><span>OUTPUT</span><strong>None generated</strong></div></div>
              <button className="button button-disabled" disabled title="AI enhancement is not connected yet"><Sparkles size={14} /> AI enhancement unavailable</button>
            </div>
            <div className="engine-panel-foot"><LockKeyhole size={12} /> Signed-in uploads use private storage; no AI job is created</div>
          </aside>
        </div>
      </section>

      <section className="feature-section section-pad" aria-labelledby="feature-title">
        <div className="section-heading" data-reveal><div><p className="eyebrow"><span /> THE CLARIFRAME APPROACH</p><h2 id="feature-title">Care, at every <em>step.</em></h2></div><p className="section-intro">A clear line between what works now and what is still being built.</p></div>
        <div className="feature-grid">
          <article className="feature-card feature-card-large" data-reveal><div className="feature-card-top"><span className="feature-icon"><Film size={17} /></span><span className="feature-label">AVAILABLE NOW</span></div><h3>Look before you let go.</h3><p>Preview a supported clip locally and read its dimensions, duration, and file size before deciding what to do next.</p><div className="feature-preview-line"><span className="preview-line-icon"><Waves size={14} /></span><span>Browser-based source inspection</span><span className="line-state">READY</span></div></article>
          <article className="feature-card feature-card-limit" data-reveal><div className="feature-card-top"><span className="feature-icon"><Clapperboard size={17} /></span><span className="feature-label">PRODUCT SCOPE</span></div><p className="limit-number mono">60<span> SEC</span></p><h3>Made for the moments you keep.</h3><p>The product is designed around short source clips. Duration checks in this preview run in your browser only.</p></article>
          <article className="feature-card feature-card-model" data-reveal><div className="feature-card-top"><span className="feature-icon"><Sparkles size={17} /></span><span className="feature-label">IN DEVELOPMENT</span></div><div className="model-mark"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><h3>Real restoration takes a real model.</h3><p>We will not label a sharpened filter or a placeholder export as AI enhancement. Inference must be verifiable before results appear.</p><span className="model-state"><i /> ENGINE NOT CONNECTED</span></article>
        </div>
      </section>

      <section className="field-notes section-pad" id="field-notes" aria-labelledby="notes-title">
        <div className="notes-aside" data-reveal><p className="eyebrow"><span /> FIELD NOTES&nbsp; / &nbsp;02</p><h2 id="notes-title">Nothing gets<br />better by <em>pretending.</em></h2><p>Good restoration starts with an honest source, a deliberate model, and a result you can actually inspect.</p><a className="text-link" href="#finishing-room">See the finishing room <ArrowDown size={14} /></a></div>
        <div className="notes-list" data-reveal><article><span className="note-index mono">01</span><div><h3>Keep the original close.</h3><p>Your source preview is shown as provided. The sample artwork above is an illustration, not a before-and-after claim.</p></div><span className="note-mark"><Check size={14} /></span></article><article><span className="note-index mono">02</span><div><h3>Progress should mean something.</h3><p>When processing is connected, status will reflect actual worker activity. There is no simulated progress here.</p></div><span className="note-mark"><Check size={14} /></span></article><article><span className="note-index mono">03</span><div><h3>Privacy belongs in the pipeline.</h3><p>Private storage, ownership checks, and validated media must exist before a clip can leave your device.</p></div><span className="note-mark"><LockKeyhole size={14} /></span></article></div>
      </section>

      <section className="results-section section-pad" id="finishing-room" aria-labelledby="results-title">
        <div className="results-heading" data-reveal><div><p className="eyebrow"><span /> THE FINISHING ROOM</p><h2 id="results-title">Room for the <em>little details.</em></h2></div><span className="results-number mono">02 — COMPARE</span></div>
        <div className={`compare-shell ${clip ? "has-source" : ""}`} data-reveal>
          <div className="compare-side original-side"><div className="compare-label"><span className="compare-dot original-dot" /> SOURCE <span className="mono">/ ORIGINAL</span></div>{clip ? <video className="compare-video" src={clip.url} controls playsInline preload="metadata" aria-label={`Original video ${clip.file.name}`} /> : <div className="compare-empty"><Clapperboard size={24} strokeWidth={1.3} /><span>Your source will appear here</span></div>}<span className="compare-time mono">{clip ? formatDuration(clip.duration) : "— : —"}</span></div>
          <div className="compare-divider"><span><ArrowRight size={14} /></span></div>
          <div className="compare-side restored-side"><div className="compare-label"><span className="compare-dot restored-dot" /> RESTORED <span className="mono">/ NOT GENERATED</span></div><div className="compare-empty"><Sparkles size={23} strokeWidth={1.3} /><span>A real enhanced output will appear here when the AI worker is connected.</span></div><span className="compare-time mono">— : —</span></div>
          <div className="compare-bottom"><span><span className="status-dot muted-dot" /> {clip ? "Source loaded · waiting for real AI processing" : "Waiting for a source clip"}</span><span className="output-unavailable"><ArrowDownToLine size={13} /> Download unavailable</span></div>
        </div>
        <p className="compare-caption" data-reveal><span className="mono">NO OUTPUT GENERATED</span> A comparison control and download will appear once a genuine enhanced result is available.</p>
      </section>

      <AccountSection state={accountState} email={userEmail} notice={authNotice} uploads={storedUploads} libraryReady={uploadLibraryReady} onDelete={(id) => void removeLibraryUpload(id)} />

      <section className="privacy-note section-pad" id="privacy"><span className="privacy-icon"><ShieldCheck size={16} /></span><p><strong>Built around the moments that matter.</strong><span>Source uploads are private and server-inspected after setup. AI restoration still requires a worker and model.</span></p><a href="#top">Back to the beginning <ArrowRight size={13} /></a></section>
      <footer className="footer section-pad"><a className="brand footer-brand" href="#top"><span className="brand-mark"><span /></span><span>clari<span className="brand-light">frame</span></span></a><span>© 2026 CLARIFRAME STUDIO</span><a href="#account">ACCOUNT <ArrowRight size={12} /></a></footer>
    </main>
  );
}
