import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import KaaliMap, { type RouteGeometry } from './KaaliMap';

type Coordinate = { latitude: number; longitude: number };
type Route = {
  routeId: string;
  distanceMeters: number;
  durationSeconds: number;
  riskScore: number | null;
  riskStatus?: 'measured' | 'estimated' | 'unknown';
  riskConfidence?: number;
  riskScale: { min: number; max: number; higherIsRiskier: boolean };
  riskLabel: string;
  geometry: RouteGeometry;
  warnings: string[];
};
type RouteResult = { routeRequestId: string; routes: Route[]; selectedRouteId: string };
type ApiEnvelope<T> = { data: T };
type NavSession = { navigationSessionId: string; locationUpdateIntervalHintSeconds: number };

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
const DEVIATION_THRESHOLD_METERS = Number(import.meta.env.VITE_ROUTE_DEVIATION_THRESHOLD_METERS) || 60;

function parseCoordinatePair(value: string): Coordinate | null {
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
  const [latitude, longitude] = parts;
  if (latitude === undefined || longitude === undefined || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function App() {
  const [originText, setOriginText] = useState('40.7580, -73.9855');
  const [destinationText, setDestinationText] = useState('40.7536, -73.9832');
  const [token, setToken] = useState(() => window.localStorage.getItem('kaali_access_token') || '');
  const [priority, setPriority] = useState<'fastest' | 'balanced' | 'lower_risk'>('lower_risk');
  const [result, setResult] = useState<RouteResult | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [session, setSession] = useState<NavSession | null>(null);
  const [authDestination, setAuthDestination] = useState('');
  const [authChannel, setAuthChannel] = useState<'phone' | 'email'>('phone');
  const [challengeId, setChallengeId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [currentPosition, setCurrentPosition] = useState<Coordinate | null>(null);
  const [status, setStatus] = useState('Enter coordinates and find a route');
  const [busy, setBusy] = useState(false);
  const watchId = useRef<number | null>(null);
  const lastLocationSentAt = useRef(0);
  const lastRerouteAt = useRef(0);
  const deviationCount = useRef(0);
  const rerouting = useRef(false);
  const starting = useRef(false);
  const activeSessionId = useRef<string | null>(null);
  const latestResult = useRef<RouteResult | null>(null);
  const latestSelectedRouteId = useRef('');
  const selectedRoute = result?.routes.find((route) => route.routeId === selectedRouteId) || null;
  const origin = parseCoordinatePair(originText);
  const destination = parseCoordinatePair(destinationText);
  useEffect(() => { latestResult.current = result; }, [result]);
  useEffect(() => { latestSelectedRouteId.current = selectedRouteId; }, [selectedRouteId]);

  const requestRoute = useCallback(async (from: Coordinate, to: Coordinate, reason?: string) => {
    const response = await axios.post<ApiEnvelope<RouteResult>>(`${API_URL}/routes`, {
      origin: from,
      destination: to,
      mode: 'walking',
      priority,
      maxDetourRatio: 1.25,
    }, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
    const routeData = response.data.data;
    if (!routeData.routes.length) throw new Error('The routing service returned no usable route.');
    setResult(routeData);
    const nextSelected = routeData.selectedRouteId || routeData.routes[0]!.routeId;
    setSelectedRouteId(nextSelected);
    if (reason) setStatus('Route updated');
  }, [priority, token]);

  const findRoute = async () => {
    if (!origin || !destination) { setStatus('Enter valid latitude, longitude coordinates'); return; }
    if (!token.trim()) { setStatus('Add your Kaali access token to request a protected route'); return; }
    window.localStorage.setItem('kaali_access_token', token.trim());
    setBusy(true);
    setStatus('Calculating route');
    try {
      await requestRoute(origin, destination);
      setStatus('Route ready');
    } catch (error) {
      setStatus(axios.isAxiosError(error) ? (error.response?.data?.error?.message || 'Routing service unavailable. Check the API and routing provider configuration.') : (error instanceof Error ? error.message : 'Route request failed'));
    } finally { setBusy(false); }
  };

  const requestOtp = async () => {
    try {
      const response = await axios.post<ApiEnvelope<{ challengeId: string }>>(`${API_URL}/auth/otp`, { channel: authChannel, destination: authDestination });
      setChallengeId(response.data.data.challengeId);
      setAuthMessage('Code sent. In development, check the Express server log.');
    } catch (error) { setAuthMessage(axios.isAxiosError(error) ? (error.response?.data?.error?.message || 'Could not request a sign-in code') : 'Could not request a sign-in code'); }
  };

  const verifyOtp = async () => {
    try {
      const response = await axios.post<ApiEnvelope<{ accessToken: string }>>(`${API_URL}/auth/verify`, { challengeId, code: otpCode });
      setToken(response.data.data.accessToken);
      window.localStorage.setItem('kaali_access_token', response.data.data.accessToken);
      setAuthMessage('Signed in. Your token is saved on this device.');
    } catch (error) { setAuthMessage(axios.isAxiosError(error) ? (error.response?.data?.error?.message || 'Code could not be verified') : 'Code could not be verified'); }
  };

  const finishNavigation = useCallback(async () => {
    if (!session) return;
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    activeSessionId.current = null;
    try {
      await axios.post(`${API_URL}/navigation/sessions/${session.navigationSessionId}/finish`, { reason: 'stopped' }, { headers: { Authorization: `Bearer ${token}` } });
    } catch { /* Session may already have expired; local tracking still stops. */ }
    setSession(null);
    setCurrentPosition(null);
    setStatus('Navigation ended');
  }, [session, token]);

  const beginNavigation = async () => {
    if (starting.current || watchId.current !== null || !result || !selectedRoute) return;
    starting.current = true;
    setStatus('Starting navigation');
    try {
      const response = await axios.post<ApiEnvelope<NavSession>>(`${API_URL}/navigation/sessions`, {
        routeRequestId: result.routeRequestId,
        selectedRouteId,
        shareLocationWithContacts: false,
      }, { headers: { Authorization: `Bearer ${token}` } });
      const activeSession = response.data.data;
      activeSessionId.current = activeSession.navigationSessionId;
      setSession(activeSession);
      if (!navigator.geolocation) { setStatus('GPS unavailable'); activeSessionId.current = null; return; }
      setStatus('Requesting GPS permission');
      watchId.current = navigator.geolocation.watchPosition(async (position) => {
        if (activeSessionId.current !== activeSession.navigationSessionId) return;
        if (Date.now() - position.timestamp > 30000) { setStatus('GPS unavailable · location reading is stale'); return; }
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setCurrentPosition(point);
        setStatus('Navigation active');
        const now = Date.now();
        if (now - lastLocationSentAt.current >= Math.max(5, activeSession.locationUpdateIntervalHintSeconds) * 1000) {
          lastLocationSentAt.current = now;
          try {
            await axios.post(`${API_URL}/navigation/sessions/${activeSession.navigationSessionId}/location`, { location: { ...point, accuracyMeters: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() } }, { headers: { Authorization: `Bearer ${token}` } });
          } catch { if (activeSessionId.current === activeSession.navigationSessionId) setStatus('GPS active; server location update failed'); }
        }
        if (activeSessionId.current !== activeSession.navigationSessionId) return;
        const route = latestResult.current?.routes.find((candidate) => candidate.routeId === latestSelectedRouteId.current);
        if (!route || position.coords.accuracy > 100) return;
        const distance = distanceToRouteMeters(point, route.geometry);
        deviationCount.current = distance > Math.max(DEVIATION_THRESHOLD_METERS, position.coords.accuracy * 1.5) ? deviationCount.current + 1 : 0;
        if (deviationCount.current >= 2 && now - lastRerouteAt.current > 30000 && !rerouting.current) {
          rerouting.current = true;
          lastRerouteAt.current = now;
          deviationCount.current = 0;
          setStatus('Off route · Recalculating route');
          try {
            const reroute = await axios.post<ApiEnvelope<RouteResult>>(`${API_URL}/navigation/sessions/${activeSession.navigationSessionId}/reroute`, {
              currentLocation: { ...point, accuracyMeters: position.coords.accuracy },
              reason: 'route_deviation',
            }, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
            if (activeSessionId.current !== activeSession.navigationSessionId) return;
            const updated = reroute.data.data;
            setResult({ routeRequestId: updated.routeRequestId, routes: updated.routes, selectedRouteId: updated.selectedRouteId });
            setSelectedRouteId(updated.selectedRouteId);
            setStatus('Route rerouted');
          } catch { setStatus('Off route · Reroute failed; keeping last valid route'); }
          finally { rerouting.current = false; }
        }
      }, (error) => {
        activeSessionId.current = null;
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
        setStatus(error.code === error.PERMISSION_DENIED ? 'GPS unavailable · location permission denied' : 'GPS unavailable · check device location');
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    } catch (error) {
      activeSessionId.current = null;
      setStatus(axios.isAxiosError(error) ? (error.response?.data?.error?.message || 'Could not start navigation') : 'Could not start navigation');
    } finally { starting.current = false; }
  };

  useEffect(() => () => { activeSessionId.current = null; if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current); }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Kaali home"><span className="brand-mark">K</span><span>kaali</span></a>
        <div className="top-status"><span className={`status-dot ${session ? 'live' : ''}`} />{session ? 'Navigation active' : 'Personal safety navigation'}</div>
        <span className="pilot-pill">NEW YORK CITY PILOT</span>
      </header>
      <section className="workspace">
        <aside className="route-panel">
          <div className="eyebrow">YOUR JOURNEY</div>
          <h1>Move with more<br /><span>confidence.</span></h1>
          <p className="intro">Plan a walking route and see the information behind its estimated risk.</p>
          <label className="field-label" htmlFor="origin">Starting point <small>LATITUDE, LONGITUDE</small></label>
          <div className="coordinate-field"><span className="pin origin-pin">●</span><input id="origin" value={originText} onChange={(event) => setOriginText(event.target.value)} placeholder="40.7580, -73.9855" /></div>
          <div className="connector" />
          <label className="field-label" htmlFor="destination">Destination <small>LATITUDE, LONGITUDE</small></label>
          <div className="coordinate-field"><span className="pin destination-pin">◆</span><input id="destination" value={destinationText} onChange={(event) => setDestinationText(event.target.value)} placeholder="40.7536, -73.9832" /></div>
          <label className="field-label preference-label" htmlFor="priority">Route preference</label>
          <select id="priority" value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="lower_risk">Lower estimated risk</option><option value="balanced">Balanced</option><option value="fastest">Fastest</option></select>
          <details className="token-details"><summary>{token ? 'Signed in · manage access' : 'Sign in to Kaali'}</summary><div className="auth-fields"><div className="auth-row"><select aria-label="Sign-in channel" value={authChannel} onChange={(event) => setAuthChannel(event.target.value as typeof authChannel)}><option value="phone">Phone</option><option value="email">Email</option></select><input aria-label="Phone number or email" value={authDestination} onChange={(event) => setAuthDestination(event.target.value)} placeholder={authChannel === 'phone' ? '+91 phone number' : 'you@example.com'} /></div>{challengeId && <div className="auth-row"><input aria-label="Six-digit sign-in code" inputMode="numeric" maxLength={6} value={otpCode} onChange={(event) => setOtpCode(event.target.value)} placeholder="6-digit code" /><button className="text-button" onClick={() => void verifyOtp()}>Verify</button></div>}<button className="text-button request-code" onClick={() => void requestOtp()}>{challengeId ? 'Send another code' : 'Send sign-in code'}</button>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}</div><div className="token-divider">or use an existing access token</div><input aria-label="Kaali access token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste your access token" autoComplete="off" /></details>
          <button className="primary-button" onClick={() => void findRoute()} disabled={busy}>{busy ? <><span className="spinner" /> Calculating</> : <>Find a route <span aria-hidden="true">↗</span></>}</button>
          <div className="status-line" role="status"><span className="status-indicator" />{status}</div>
          {selectedRoute && <section className="route-result" aria-live="polite">
            <div className="result-heading"><div><span className="eyebrow">RECOMMENDED ROUTE</span><h2>Your route</h2></div><span className="route-badge">{selectedRoute.riskLabel.replaceAll('_', ' ')}</span></div>
            <div className="metrics"><div><strong>{formatDistance(selectedRoute.distanceMeters)}</strong><small>DISTANCE</small></div><div><strong>{formatDuration(selectedRoute.durationSeconds)}</strong><small>EST. WALK</small></div></div>
            <div className="risk-card"><div className="risk-top"><span>{selectedRoute.riskStatus === 'unknown' || selectedRoute.riskScore === null ? 'Risk data' : 'Estimated risk'}</span><strong>{selectedRoute.riskScore === null ? 'Unknown' : <>{selectedRoute.riskScore}<small> / {selectedRoute.riskScale.max}</small></>}</strong></div>{selectedRoute.riskScore !== null && <div className="risk-track"><span style={{ width: `${Math.max(0, Math.min(100, selectedRoute.riskScore))}%` }} /></div>}<p>{selectedRoute.riskScore === null ? 'No verified, route-matched hazard reports are available. Unknown does not mean safe.' : `Confidence: ${Math.round((selectedRoute.riskConfidence ?? 0) * 100)}%. Reports are community data, not a guarantee of safety.`}</p></div>
            {selectedRoute.warnings.map((warning) => <p className="route-warning" key={warning}>{warning}</p>)}
            <div className="route-choice">{result?.routes.map((route, index) => <button key={route.routeId} className={route.routeId === selectedRouteId ? 'choice active' : 'choice'} onClick={() => setSelectedRouteId(route.routeId)}><span>Option {index + 1}</span><strong>{formatDuration(route.durationSeconds)}</strong></button>)}</div>
            {session ? <button className="secondary-button" onClick={() => void finishNavigation()}>End navigation</button> : <button className="secondary-button" onClick={() => void beginNavigation()}>Start navigation <span>→</span></button>}
          </section>}
          <footer className="panel-foot"><span className="shield">◇</span><p>Risk estimates are informational and cannot guarantee personal safety.</p></footer>
        </aside>
        <section className="map-area" aria-label="Route map"><KaaliMap origin={origin} destination={destination} route={selectedRoute?.geometry || null} currentPosition={currentPosition} /><div className="map-caption"><span className="map-caption-dot" />{selectedRoute ? `${result?.routes.length ?? 1} route option${result?.routes.length === 1 ? '' : 's'}` : 'Map preview'}<span className="caption-divider" />OpenStreetMap data</div><button className="map-control" aria-label="Center map" onClick={() => window.dispatchEvent(new Event('kaali:center-map'))}>◎</button></section>
      </section>
    </main>
  );
}

function formatDistance(meters: number): string { return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`; }
function formatDuration(seconds: number): string { const minutes = Math.max(1, Math.round(seconds / 60)); return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`; }
function distanceToRouteMeters(point: Coordinate, geometry: RouteGeometry): number {
  const toXY = (lon: number, lat: number) => ({ x: (lon - point.longitude) * 111320 * Math.cos(point.latitude * Math.PI / 180), y: (lat - point.latitude) * 111320 });
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    const startPair = geometry.coordinates[index - 1]; const endPair = geometry.coordinates[index];
    if (!startPair || !endPair) continue;
    const start = toXY(startPair[0], startPair[1]); const end = toXY(endPair[0], endPair[1]);
    const dx = end.x - start.x; const dy = end.y - start.y;
    const fraction = Math.max(0, Math.min(1, -(start.x * dx + start.y * dy) / (dx * dx + dy * dy || 1)));
    minimum = Math.min(minimum, Math.hypot(start.x + fraction * dx, start.y + fraction * dy));
  }
  return minimum;
}

export default App;
