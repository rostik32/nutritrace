<script>
  import { copyText } from '../../lib/clipboard.js';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { slide } from 'svelte/transition';
  import Toggle from './Toggle.svelte';
  import TimePicker from '../ui/TimePicker.svelte';
  import ConnectionStatus from './ConnectionStatus.svelte';
  import { showSuccess, showError } from '../../stores/toast.js';
  import { localizeError } from '../../lib/server-errors.js';
  import {
    wellnessEnabled, fitbitEnabled, healthConnectEnabled, wellnessMetrics, workoutsEnabled, mirrorWellnessWeight,
    lifttraceOverlapFill, envLocks,
    wellnessSyncRange,
    fitbitSyncMode, fitbitSyncInterval, fitbitSyncWindowStart, fitbitSyncWindowEnd,
    withingsSyncRange, withingsEnabled,
    withingsSyncMode, withingsSyncInterval, withingsSyncWindowStart, withingsSyncWindowEnd,
    garminEnabled, garminSyncRange,
    garminSyncMode, garminSyncInterval, garminSyncWindowStart, garminSyncWindowEnd,
    healthConnectSyncMode, healthConnectSyncInterval, healthConnectSyncWindowStart, healthConnectSyncWindowEnd,
  } from '../../stores/settings.js';
  import { DB } from '../../lib/db.js';
  import { NtApi } from '../../lib/api.js';
  import { currentUser, userMgmtActive } from '../../stores/auth.js';
  import { isNative, getServerUrl } from '../../lib/platform.js';
  const isNativeLocal = isNative && !getServerUrl();

  // ── Wellness state ──────────────────────────────────────────────────────────
  let wellnessEnabledVal   = DB.getSetting('wellnessEnabled',   false);
  let fitbitEnabledVal     = DB.getSetting('fitbitEnabled',     false);
  let withingsEnabledVal   = DB.getSetting('withingsEnabled',   false);
  let healthConnectEnabledVal = DB.getSetting('healthConnectEnabled', false);
  let workoutsEnabledVal     = DB.getSetting('workoutsEnabled',     false);
  let lifttraceOverlapFillVal = DB.getSetting('lifttraceOverlapFill', true);
  // #200: opt-in mirror from wellness weight readings → diary Body Stats weight.
  let mirrorWellnessWeightVal = DB.getSetting('mirrorWellnessWeight', false);
  let healthConnectAvailability = 'checking';
  let healthConnectPermissions = { read: [] };
  let hcLastBgSyncAt = null;

  // Check Health Connect availability on mount
  if (isNative) {
    import('../../lib/health-connect.js').then(async ({ checkAvailability, getGrantedPermissions }) => {
      healthConnectAvailability = await checkAvailability();
      if (healthConnectAvailability === 'Available') {
        healthConnectPermissions = await getGrantedPermissions();
      }
    }).catch(() => { healthConnectAvailability = 'NotSupported'; });
    // Read last background-sync timestamp the Kotlin worker stamps into
    // sync_meta on each successful run. Surfaces "Last synced X ago" so users
    // can verify the WorkManager job is actually firing.
    import('../../lib/db-native.js').then(async ({ getDb }) => {
      try {
        const db = await getDb();
        const r = await db.query(`SELECT value FROM sync_meta WHERE key = 'hc_last_bg_sync_at'`, []);
        const v = r?.values?.[0]?.value;
        if (v) hcLastBgSyncAt = v;
      } catch {}
    }).catch(() => {});
  }

  function _formatRelative(iso) {
    if (!iso) return $_('settings_wellness.time.never');
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return $_('settings_wellness.time.never');
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (mins < 1)   return $_('settings_wellness.time.just_now_short');
    if (mins < 60)  return $_('settings_wellness.time.min_ago', { values: { n: mins } });
    const hrs = Math.round(mins / 60);
    if (hrs < 24)   return $_('settings_wellness.time.hr_ago', { values: { n: hrs } });
    const days = Math.round(hrs / 24);
    return $_('settings_wellness.time.days_ago', { values: { count: days } });
  }

  // Auto-load config when component mounts (in case parent didn't call loadWellnessConfig)
  onMount(() => { loadWellnessConfig(); });

  // ── Wellness metric visibility (per integration, alphabetical by label) ──
  const FITBIT_METRICS = [
    { id: 'active_minutes',       label: 'settings_wellness.metric_label.active_minutes'       },
    { id: 'active_zone_minutes',  label: 'settings_wellness.metric_label.active_zone_minutes'  },
    { id: 'calories_out',         label: 'settings_wellness.metric_label.calories_out'         },
    { id: 'sleep_deep_min',       label: 'settings_wellness.metric_label.sleep_deep_min'       },
    { id: 'distance_km',          label: 'settings_wellness.metric_label.distance_km'         },
    { id: 'floors',               label: 'settings_wellness.metric_label.floors'           },
    { id: 'hrv_daily_rmssd',      label: 'settings_wellness.metric_label.hrv_daily_rmssd'              },
    { id: 'sleep_light_min',      label: 'settings_wellness.metric_label.sleep_light_min'      },
    { id: 'sleep_rem_min',        label: 'settings_wellness.metric_label.sleep_rem_min'        },
    { id: 'respiratory_rate',     label: 'settings_wellness.metric_label.respiratory_rate'       },
    { id: 'resting_hr',           label: 'settings_wellness.metric_label.resting_hr'       },
    { id: 'sleep_duration_min',   label: 'settings_wellness.metric_label.sleep_duration_min'   },
    { id: 'sleep_efficiency',     label: 'settings_wellness.metric_label.sleep_efficiency' },
    { id: 'skin_temp_variation',  label: 'settings_wellness.metric_label.skin_temp_variation'   },
    { id: 'sleep_score',          label: 'settings_wellness.metric_label.sleep_score'      },
    { id: 'spo2_avg',             label: 'settings_wellness.metric_label.spo2_avg'             },
    { id: 'steps',                label: 'settings_wellness.metric_label.steps'            },
    { id: 'vo2_max',              label: 'settings_wellness.metric_label.vo2_max'   },
    { id: 'sleep_wake_min',       label: 'settings_wellness.metric_label.sleep_wake_min'        },
  ];
  const GARMIN_METRICS = [
    { id: 'active_minutes',         label: 'settings_wellness.metric_label.active_minutes'          },
    { id: 'body_battery_high',      label: 'settings_wellness.metric_label.body_battery_high'        },
    { id: 'body_battery_low',       label: 'settings_wellness.metric_label.body_battery_low'         },
    { id: 'calories_out',           label: 'settings_wellness.metric_label.calories_out'            },
    { id: 'sleep_deep_min',         label: 'settings_wellness.metric_label.sleep_deep_min'          },
    { id: 'distance_km',            label: 'settings_wellness.metric_label.distance_km'            },
    { id: 'floors',                 label: 'settings_wellness.metric_label.floors'              },
    { id: 'hrv_daily_rmssd',        label: 'settings_wellness.metric_label.hrv_daily_rmssd'                 },
    { id: 'sleep_light_min',        label: 'settings_wellness.metric_label.sleep_light_min'         },
    { id: 'max_hr',                 label: 'settings_wellness.metric_label.max_hr'              },
    { id: 'moderate_intensity_min', label: 'settings_wellness.metric_label.moderate_intensity_min'  },
    { id: 'sleep_rem_min',          label: 'settings_wellness.metric_label.sleep_rem_min'           },
    { id: 'respiratory_rate',       label: 'settings_wellness.metric_label.respiratory_rate'          },
    { id: 'resting_hr',             label: 'settings_wellness.metric_label.resting_hr'          },
    { id: 'sleep_duration_min',     label: 'settings_wellness.metric_label.sleep_duration_min'      },
    { id: 'sleep_score',            label: 'settings_wellness.metric_label.sleep_score'         },
    { id: 'spo2_avg',               label: 'settings_wellness.metric_label.spo2_avg'                },
    { id: 'steps',                  label: 'settings_wellness.metric_label.steps'               },
    { id: 'stress_avg',             label: 'settings_wellness.metric_label.stress_avg'              },
    { id: 'vigorous_intensity_min', label: 'settings_wellness.metric_label.vigorous_intensity_min'  },
    { id: 'sleep_wake_min',         label: 'settings_wellness.metric_label.sleep_wake_min'           },
  ];
  const WITHINGS_METRICS = [
    { id: 'ecg_afib',            label: 'settings_wellness.metric_label.ecg_afib'               },
    { id: 'basal_metabolic_rate',     label: 'settings_wellness.metric_label.basal_metabolic_rate' },
    { id: 'body_fat_pct',        label: 'settings_wellness.metric_label.body_fat_pct'           },
    { id: 'body_water_pct',      label: 'settings_wellness.metric_label.body_water_pct'         },
    { id: 'bone_mass_kg',        label: 'settings_wellness.metric_label.bone_mass_kg'          },
    { id: 'eda_feet',                 label: 'settings_wellness.metric_label.eda_feet'           },
    { id: 'ecg_heart_rate',           label: 'settings_wellness.metric_label.ecg_heart_rate'          },
    { id: 'extracellular_water_kg',   label: 'settings_wellness.metric_label.extracellular_water_kg'    },
    { id: 'fat_mass_kg',              label: 'settings_wellness.metric_label.fat_mass_kg'            },
    { id: 'intracellular_water_kg',   label: 'settings_wellness.metric_label.intracellular_water_kg'    },
    { id: 'lean_mass_kg',             label: 'settings_wellness.metric_label.lean_mass_kg'           },
    { id: 'metabolic_age',            label: 'settings_wellness.metric_label.metabolic_age'       },
    { id: 'muscle_mass_kg',           label: 'settings_wellness.metric_label.muscle_mass_kg'         },
    { id: 'nerve_health_score',       label: 'settings_wellness.metric_label.nerve_health_score'        },
    { id: 'pulse_wave_velocity', label: 'settings_wellness.metric_label.pulse_wave_velocity'         },
    { id: 'segmental_analysis',  label: 'settings_wellness.metric_label.segmental_analysis' },
    { id: 'vascular_age',        label: 'settings_wellness.metric_label.vascular_age'       },
    { id: 'visceral_fat',             label: 'settings_wellness.metric_label.visceral_fat'        },
    { id: 'visceral_fat_index',       label: 'settings_wellness.metric_label.visceral_fat_index'  },
    { id: 'weight_kg',                label: 'settings_wellness.metric_label.weight_kg'              },
  ];
  const HC_METRICS = [
    { id: 'active_calories',           label: 'settings_wellness.metric_label.active_calories'     },
    { id: 'active_minutes',            label: 'settings_wellness.metric_label.active_minutes'          },
    { id: 'avg_heart_rate',            label: 'settings_wellness.metric_label.avg_heart_rate'      },
    { id: 'basal_metabolic_rate',      label: 'settings_wellness.metric_label.basal_metabolic_rate'},
    { id: 'blood_pressure_systolic',   label: 'settings_wellness.metric_label.blood_pressure_systolic'},
    { id: 'blood_pressure_diastolic',  label: 'settings_wellness.metric_label.blood_pressure_diastolic'},
    { id: 'body_fat_pct',             label: 'settings_wellness.metric_label.body_fat_pct'            },
    { id: 'body_temperature',          label: 'settings_wellness.metric_label.body_temperature'    },
    { id: 'bone_mass_kg',             label: 'settings_wellness.metric_label.bone_mass_kg'           },
    { id: 'calories_out',             label: 'settings_wellness.metric_label.calories_out'            },
    { id: 'distance_km',              label: 'settings_wellness.metric_label.distance_km'            },
    { id: 'floors',                   label: 'settings_wellness.metric_label.floors'              },
    { id: 'lean_mass_kg',             label: 'settings_wellness.metric_label.lean_mass_kg'           },
    { id: 'resting_hr',               label: 'settings_wellness.metric_label.resting_hr'          },
    { id: 'respiratory_rate',          label: 'settings_wellness.metric_label.respiratory_rate'          },
    { id: 'sleep_duration_min',        label: 'settings_wellness.metric_label.sleep_duration_min'      },
    { id: 'sleep_deep_min',           label: 'settings_wellness.metric_label.sleep_deep_min'          },
    { id: 'sleep_light_min',          label: 'settings_wellness.metric_label.sleep_light_min'         },
    { id: 'sleep_rem_min',            label: 'settings_wellness.metric_label.sleep_rem_min'           },
    { id: 'sleep_wake_min',           label: 'settings_wellness.metric_label.sleep_wake_min'           },
    { id: 'spo2_avg',                 label: 'settings_wellness.metric_label.spo2_avg'                },
    { id: 'steps',                    label: 'settings_wellness.metric_label.steps'               },
    { id: 'vo2_max',                  label: 'settings_wellness.metric_label.vo2_max'      },
    { id: 'water_ml',                 label: 'settings_wellness.metric_label.water_ml'           },
    { id: 'weight_kg',                label: 'settings_wellness.metric_label.weight_kg'              },
  ];

  function isWellnessMetricVisible(id) {
    const vis = $wellnessMetrics;
    return vis == null || vis.includes(id);
  }

  function toggleWellnessMetric(id) {
    const allIds = [...new Set([...FITBIT_METRICS, ...GARMIN_METRICS, ...WITHINGS_METRICS, ...HC_METRICS].map(m => m.id))];
    const cur = $wellnessMetrics ?? allIds;
    if (cur.includes(id)) {
      wellnessMetrics.set(cur.filter(x => x !== id));
    } else {
      wellnessMetrics.set([...cur, id]);
    }
  }

  let wellnessSyncRangeVal    = DB.getSetting('wellnessSyncRange',    7);

  // Per-device sync state — defaults to 'auto' mode + daily interval (1440 min)
  // when never set. Each device tracks its own values independently.
  const _defaultMode = 'auto';
  const _defaultInterval = 1440; // daily
  let fitbitSyncModeVal         = DB.getSetting('fitbitSyncMode',         _defaultMode);
  let fitbitSyncIntervalVal     = DB.getSetting('fitbitSyncInterval',     _defaultInterval);
  let fitbitSyncWindowStartVal  = DB.getSetting('fitbitSyncWindowStart',  '');
  let fitbitSyncWindowEndVal    = DB.getSetting('fitbitSyncWindowEnd',    '');
  let withingsSyncModeVal       = DB.getSetting('withingsSyncMode',       _defaultMode);
  let withingsSyncIntervalVal   = DB.getSetting('withingsSyncInterval',   _defaultInterval);
  let withingsSyncWindowStartVal= DB.getSetting('withingsSyncWindowStart','');
  let withingsSyncWindowEndVal  = DB.getSetting('withingsSyncWindowEnd',  '');
  let garminSyncModeVal         = DB.getSetting('garminSyncMode',         _defaultMode);
  let garminSyncIntervalVal     = DB.getSetting('garminSyncInterval',     _defaultInterval);
  let garminSyncWindowStartVal  = DB.getSetting('garminSyncWindowStart',  '');
  let garminSyncWindowEndVal    = DB.getSetting('garminSyncWindowEnd',    '');
  let hcSyncModeVal             = DB.getSetting('healthConnectSyncMode',         _defaultMode);
  let hcSyncIntervalVal         = DB.getSetting('healthConnectSyncInterval',     _defaultInterval);
  let hcSyncWindowStartVal      = DB.getSetting('healthConnectSyncWindowStart',  '');
  let hcSyncWindowEndVal        = DB.getSetting('healthConnectSyncWindowEnd',    '');

  const SYNC_INTERVALS = [
    { value: 30,   label: 'settings_wellness.interval_opt.every_30_min' },
    { value: 60,   label: 'settings_wellness.interval_opt.every_hour' },
    { value: 120,  label: 'settings_wellness.interval_opt.every_2_hours' },
    { value: 180,  label: 'settings_wellness.interval_opt.every_3_hours' },
    { value: 360,  label: 'settings_wellness.interval_opt.every_6_hours' },
    { value: 720,  label: 'settings_wellness.interval_opt.every_12_hours' },
    { value: 1440, label: 'settings_wellness.interval_opt.once_a_day' },
  ];

  // Recommended range options shown first — safe for any device API
  const SYNC_RANGE_RECOMMENDED = [
    { value: 1,   label: 'settings_wellness.range_opt.day_1' },
    { value: 7,   label: 'settings_wellness.range_opt.week_1' },
    { value: 30,  label: 'settings_wellness.range_opt.month_1' },
    { value: 90,  label: 'settings_wellness.range_opt.months_3' },
  ];
  // Advanced range options — per device, since each API has different limits
  // Fitbit: 6m + 1y allowed (rate limited but workable)
  // Garmin: 6m only (API doesn't reliably deliver beyond ~6 months)
  // Withings: 6m + 1y allowed (most generous historical depth)
  const SYNC_RANGE_ADVANCED_FITBIT   = [ { value: 180, label: 'settings_wellness.range_opt.months_6' }, { value: 365, label: 'settings_wellness.range_opt.year_1' } ];
  const SYNC_RANGE_ADVANCED_GARMIN   = [ { value: 180, label: 'settings_wellness.range_opt.months_6' } ];
  const SYNC_RANGE_ADVANCED_WITHINGS = [ { value: 180, label: 'settings_wellness.range_opt.months_6' }, { value: 365, label: 'settings_wellness.range_opt.year_1' } ];

  // All known options for "is this a known chip?" check (controls input-active highlight)
  const SYNC_RANGE_ALL_VALUES = new Set([1, 7, 30, 90, 180, 365]);

  // Custom number input max per device — soft cap, not enforced validation
  const CUSTOM_MAX_FITBIT   = 365;
  const CUSTOM_MAX_GARMIN   = 180;
  const CUSTOM_MAX_WITHINGS = 365;

  // ── Fitbit ──────────────────────────────────────────────────────────────────
  // Fitbit-card state vars. Credentials now hold a Google Cloud OAuth
  // client (the data is still Fitbit, just over the new Google Health
  // API pipe). State var names are kept for diff hygiene.
  let fitbitClientId     = '';
  let fitbitClientSecret = '';
  let fitbitRedirectUri  = '';
  let fitbitShowSecret   = false;
  let fitbitEditingCreds = false;
  let fitbitRedirectSuggested = '';
  let wellnessConfigLoaded = false;
  let fitbitConnectionStatus  = null;  // status from /api/wellness/google-health/status
  let legacyFitbitConnected   = false; // user has fitbit_tokens but no google_health_tokens — re-link prompt
  let disconnectingFitbit   = false;
  let connectingFitbit  = false;

  // ── Withings ────────────────────────────────────────────────────────────────
  let withingsClientId     = '';
  let withingsClientSecret = '';
  let withingsRedirectUri  = '';
  let withingsShowSecret   = false;
  let withingsEditingCreds = false;
  let withingsRedirectSuggested = '';
  let withingsSyncRangeVal = DB.getSetting('withingsSyncRange', 7);
  let withingsConnectionStatus = null;
  let disconnectingWithings = false;
  let connectingWithings = false;

  // ── Garmin ──────────────────────────────────────────────────────────────────
  let garminEnabledVal     = DB.getSetting('garminEnabled',   false);
  let garminSyncRangeVal   = DB.getSetting('garminSyncRange', 7);
  let garminConsumerKey    = '';
  let garminConsumerSecret = '';
  let garminRedirectUri    = '';
  let garminShowSecret     = false;
  let garminEditingCreds   = false;
  let garminRedirectSuggested = '';
  let garminConnectionStatus = null;
  let disconnectingGarmin    = false;
  let connectingGarmin       = false;

  // Format a timestamp as "X minutes/hours/days ago"
  function _timeAgo(isoStr) {
    if (!isoStr) return null;
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2)   return $_('settings_wellness.time.just_now');
    if (mins < 60)  return $_('settings_wellness.time.minutes_ago', { values: { count: mins } });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return $_('settings_wellness.time.hours_ago', { values: { count: hrs } });
    const days = Math.floor(hrs / 24);
    return $_('settings_wellness.time.days_ago', { values: { count: days } });
  }

  export async function loadWellnessConfig() {
    if (wellnessConfigLoaded) return;
    wellnessConfigLoaded = true;
    // Fitbit redirect URI suggestion now points at the Google Health
    // callback (the new OAuth pipe). The data source label is still Fitbit.
    fitbitRedirectSuggested   = window.location.origin + '/api/wellness/google-health/callback';
    withingsRedirectSuggested = window.location.origin + '/api/wellness/withings/callback';
    garminRedirectSuggested   = window.location.origin + '/api/wellness/garmin/callback';
    // Load all configs in parallel.
    const isAdmin = $currentUser?.role === 'admin' || !$userMgmtActive;
    const [ghCfg, withingsCfg, garminCfg, appCfg] = await Promise.allSettled([
      NtApi.get('/api/wellness/google-health/config'),
      NtApi.get('/api/wellness/withings/config'),
      NtApi.get('/api/wellness/garmin/config'),
      isAdmin ? NtApi.get('/api/app-config') : Promise.resolve(null),
    ]);
    if (ghCfg.status === 'fulfilled' && ghCfg.value) {
      fitbitClientId    = ghCfg.value.client_id    || '';
      fitbitRedirectUri = ghCfg.value.redirect_uri || '';
    }
    if (withingsCfg.status === 'fulfilled' && withingsCfg.value) {
      withingsClientId    = withingsCfg.value.client_id    || '';
      withingsRedirectUri = withingsCfg.value.redirect_uri || '';
    }
    if (garminCfg.status === 'fulfilled' && garminCfg.value) {
      garminConsumerKey = garminCfg.value.consumer_key  || '';
      garminRedirectUri = garminCfg.value.redirect_uri  || '';
    }
    if (isAdmin && appCfg.status === 'fulfilled' && appCfg.value) {
      const cfg = appCfg.value;
      if (!fitbitClientId)       fitbitClientId       = cfg.google_health_client_id     || '';
      if (!fitbitClientSecret)   fitbitClientSecret   = cfg.google_health_client_secret || '';
      if (!fitbitRedirectUri)    fitbitRedirectUri    = cfg.google_health_redirect_uri  || '';
      if (!withingsClientId)     withingsClientId     = cfg.withings_client_id  || '';
      if (!withingsClientSecret) withingsClientSecret = cfg.withings_client_secret || '';
      if (!withingsRedirectUri)  withingsRedirectUri  = cfg.withings_redirect_uri  || '';
    }
    // Load connection status. fitbitConnectionStatus reflects the NEW path
    // (google-health). legacyFitbitConnected = true means the user still
    // has tokens from the old fitbit.com OAuth flow and should re-link.
    const [ghSt, legacyFitbitSt, withingsSt, garminSt] = await Promise.allSettled([
      NtApi.get('/api/wellness/google-health/status'),
      NtApi.get('/api/wellness/fitbit/status'),
      NtApi.get('/api/wellness/withings/status'),
      NtApi.get('/api/wellness/garmin/status'),
    ]);
    fitbitConnectionStatus   = ghSt.status === 'fulfilled' ? ghSt.value : { connected: false };
    legacyFitbitConnected    = (legacyFitbitSt.status === 'fulfilled' && legacyFitbitSt.value?.connected) === true
                                && !fitbitConnectionStatus.connected;
    withingsConnectionStatus = withingsSt.status === 'fulfilled' ? withingsSt.value : { connected: false };
    garminConnectionStatus   = garminSt.status   === 'fulfilled' ? garminSt.value   : { connected: false };
  }

  async function disconnectFitbitFromSettings() {
    disconnectingFitbit = true;
    try {
      // Disconnect both Google Health (new path) and legacy Fitbit Web API
      // (if still around). Either may not exist; ignore individual failures.
      await Promise.allSettled([
        NtApi.del('/api/wellness/google-health/disconnect'),
        NtApi.del('/api/wellness/fitbit/disconnect'),
      ]);
      fitbitConnectionStatus = { ...fitbitConnectionStatus, connected: false };
      legacyFitbitConnected = false;
      showSuccess($_('settings_wellness.fitbit.disconnected'));
    } catch(e) { showError(localizeError(e.message)); }
    disconnectingFitbit = false;
  }

  async function disconnectWithingsFromSettings() {
    disconnectingWithings = true;
    try {
      await NtApi.del('/api/wellness/withings/disconnect');
      withingsConnectionStatus = { ...withingsConnectionStatus, connected: false };
      showSuccess($_('settings_wellness.withings.disconnected'));
    } catch(e) { showError(localizeError(e.message)); }
    disconnectingWithings = false;
  }

  async function connectFitbitFromSettings() {
    // Connect now goes through the Google Health API (legacy dev.fitbit.com
    // OAuth doesn't accept new app registrations anymore — Sept 2026 cutoff
    // for the legacy API). The data source is still Fitbit, just a new pipe.
    connectingFitbit = true;
    try {
      const { url } = await NtApi.get('/api/wellness/google-health/authorize' + (isNative ? '?native=1' : ''));
      if (isNative) {
        const { openOAuth } = await import('../../lib/oauth-native.js');
        await openOAuth(url);
      } else {
        window.location.href = url;
      }
    } catch(e) {
      showError(localizeError(e.message) || $_('settings_wellness.fitbit.auth_start_failed'));
      connectingFitbit = false;
    }
  }

  async function connectWithingsFromSettings() {
    connectingWithings = true;
    try {
      const { url } = await NtApi.get('/api/wellness/withings/authorize' + (isNative ? '?native=1' : ''));
      if (isNative) {
        const { openOAuth } = await import('../../lib/oauth-native.js');
        await openOAuth(url);
      } else {
        window.location.href = url;
      }
    } catch(e) {
      showError(localizeError(e.message) || $_('settings_wellness.withings.auth_start_failed'));
      connectingWithings = false;
    }
  }

  async function saveFitbitConfig() {
    // Credentials are now Google Cloud OAuth client (new pipe to the same
    // Fitbit data). The fitbit* state var names are left as-is for diff
    // hygiene — they hold Google Cloud creds going forward.
    try {
      await NtApi.put('/api/wellness/google-health/config', {
        client_id:     fitbitClientId,
        client_secret: fitbitClientSecret || undefined,
        redirect_uri:  fitbitRedirectUri,
      });
      fitbitConnectionStatus = null;
      fitbitConnectionStatus = await NtApi.get('/api/wellness/google-health/status');
      fitbitEditingCreds = false;
      showSuccess($_('settings_wellness.fitbit.creds_saved'));
    } catch (e) { showError($_('settings_wellness.common.save_failed_prefix') + localizeError(e.message)); }
  }

  // ── Sync helpers — pull today's metrics from each provider ──────────────
  function _todayStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  }

  let syncingFitbit = false;
  let lastSyncResult = null;  // { ok, count, date }
  async function syncFitbitNow() {
    syncingFitbit = true;
    lastSyncResult = null;
    try {
      const today = _todayStr();
      const r = await NtApi.post('/api/wellness/google-health/sync', { date: today });
      const dayResult = r?.results?.[today];
      if (dayResult?.ok) {
        lastSyncResult = { ok: true, count: dayResult.count, date: today };
        showSuccess($_('settings_wellness.fitbit.synced_count', { values: { count: dayResult.count, date: today } }));
      } else {
        lastSyncResult = { ok: false, error: dayResult?.error || $_('settings_wellness.common.unknown_error') };
        showError($_('settings_wellness.common.sync_failed', { values: { error: localizeError(lastSyncResult.error) } }));
      }
    } catch (e) {
      lastSyncResult = { ok: false, error: e.message };
      showError($_('settings_wellness.common.sync_failed', { values: { error: localizeError(e.message) } }));
    }
    syncingFitbit = false;
  }

  let syncingWithings = false;
  async function syncWithingsNow() {
    syncingWithings = true;
    try {
      const today = _todayStr();
      const r = await NtApi.post('/api/wellness/withings/sync', { from: today, to: today });
      const count = r?.count ?? r?.results?.[today]?.count ?? 0;
      showSuccess($_('settings_wellness.common.synced_provider_metrics', { values: { count, provider: 'Withings', date: today } }));
    } catch (e) {
      showError($_('settings_wellness.common.provider_sync_failed', { values: { provider: 'Withings', error: e?.message ? localizeError(e.message) : $_('settings_wellness.common.unknown_error') } }));
    }
    syncingWithings = false;
  }

  let syncingGarmin = false;
  async function syncGarminNow() {
    syncingGarmin = true;
    try {
      const today = _todayStr();
      const r = await NtApi.post('/api/wellness/garmin/sync', { from: today, to: today });
      const count = r?.count ?? r?.results?.[today]?.count ?? 0;
      showSuccess($_('settings_wellness.common.synced_provider_metrics', { values: { count, provider: 'Garmin', date: today } }));
    } catch (e) {
      showError($_('settings_wellness.common.provider_sync_failed', { values: { provider: 'Garmin', error: e?.message ? localizeError(e.message) : $_('settings_wellness.common.unknown_error') } }));
    }
    syncingGarmin = false;
  }

  let syncingHc = false;
  async function syncHcNow() {
    syncingHc = true;
    try {
      const { syncHealthConnect } = await import('../../lib/health-connect.js');
      const today = _todayStr();
      const result = await syncHealthConnect(today);
      const count = result?.count ?? 0;
      showSuccess($_('settings_wellness.common.synced_provider_metrics', { values: { count, provider: 'Health Connect', date: today } }));
    } catch (e) {
      showError($_('settings_wellness.common.provider_sync_failed', { values: { provider: 'Health Connect', error: e?.message ? localizeError(e.message) : $_('settings_wellness.common.unknown_error') } }));
    }
    syncingHc = false;
  }

  function copyRedirectUri() {
    copyText(fitbitRedirectUri || fitbitRedirectSuggested).then(() => showSuccess($_('settings_wellness.common.copied')), () => showError($_('settings_wellness.common.copy_failed')));
  }

  async function disconnectGarminFromSettings() {
    disconnectingGarmin = true;
    try {
      await NtApi.del('/api/wellness/garmin/disconnect');
      garminConnectionStatus = { ...garminConnectionStatus, connected: false };
      showSuccess($_('settings_wellness.garmin.disconnected'));
    } catch(e) { showError(localizeError(e.message)); }
    disconnectingGarmin = false;
  }

  async function connectGarminFromSettings() {
    connectingGarmin = true;
    try {
      const { url } = await NtApi.get('/api/wellness/garmin/authorize' + (isNative ? '?native=1' : ''));
      if (isNative) {
        const { openOAuth } = await import('../../lib/oauth-native.js');
        await openOAuth(url);
      } else {
        window.location.href = url;
      }
    } catch(e) {
      showError(localizeError(e.message) || $_('settings_wellness.garmin.auth_start_failed'));
      connectingGarmin = false;
    }
  }

  async function saveGarminConfig() {
    try {
      await NtApi.put('/api/wellness/garmin/config', {
        consumer_key:    garminConsumerKey,
        consumer_secret: garminConsumerSecret || undefined,
        redirect_uri:    garminRedirectUri,
      });
      garminConnectionStatus = null;
      garminConnectionStatus = await NtApi.get('/api/wellness/garmin/status');
      garminEditingCreds = false;
      showSuccess($_('settings_wellness.garmin.creds_saved'));
    } catch(e) { showError($_('settings_wellness.common.save_failed_prefix') + localizeError(e.message)); }
  }

  function copyGarminRedirectUri() {
    copyText(garminRedirectUri || garminRedirectSuggested).then(() => showSuccess($_('settings_wellness.common.copied')), () => showError($_('settings_wellness.common.copy_failed')));
  }

  async function saveWithingsConfig() {
    try {
      await NtApi.put('/api/wellness/withings/config', {
        client_id:     withingsClientId,
        client_secret: withingsClientSecret || undefined,
        redirect_uri:  withingsRedirectUri,
      });
      withingsConnectionStatus = null;
      withingsConnectionStatus = await NtApi.get('/api/wellness/withings/status');
      withingsEditingCreds = false;
      showSuccess($_('settings_wellness.withings.creds_saved'));
    } catch (e) { showError($_('settings_wellness.common.save_failed_prefix') + localizeError(e.message)); }
  }

  function copyWithingsRedirectUri() {
    copyText(withingsRedirectUri || withingsRedirectSuggested).then(() => showSuccess($_('settings_wellness.common.copied')), () => showError($_('settings_wellness.common.copy_failed')));
  }
</script>

<div class="section-body" transition:slide={{ duration: 180 }}>

  <!-- Master toggle + sync mode -->
  <div class="card settings-card">
    <div class="setting-row">
      <div>
        <span class="setting-label">{$_('settings_wellness.master.label')}</span>
        <div class="setting-desc">{$_('settings_wellness.master.desc')}</div>
      </div>
      <Toggle checked={wellnessEnabledVal} on:change={e => { wellnessEnabledVal = e.detail; wellnessEnabled.set(e.detail); }} />
    </div>
    {#if wellnessEnabledVal}
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div>
          <span class="setting-desc">{$_('settings_wellness.master.schedule_note')}</span>
        </div>
      </div>
      <!-- #200 mirror toggle. Off by default so the two-store split
           stays intact for anyone who wasn't asking for it. Manual
           Body Stats entries always win — the mirror only fills days
           where Body Stats weight is empty. Withings already applies
           this behavior unconditionally; the toggle covers Health
           Connect and any future weight-writing wellness source. -->
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div>
          <span class="setting-label">{$_('settings_wellness.mirror.label')}</span>
          <div class="setting-desc">{$_('settings_wellness.mirror.desc')}</div>
        </div>
        <Toggle checked={mirrorWellnessWeightVal}
          on:change={e => { mirrorWellnessWeightVal = e.detail; mirrorWellnessWeight.set(e.detail); }} />
      </div>
    {/if}
  </div>

  {#if wellnessEnabledVal}
    <!-- ── Fitbit ── -->
    <p class="sub-label" style="padding-top:16px">{$_('settings_wellness.fitbit.title')}</p>
    <div class="card settings-card">
      {#if !isNativeLocal && fitbitEnabledVal && fitbitConnectionStatus?.connected}
        <ConnectionStatus
          status="ok"
          okLabel={$_('settings_wellness.common.linked')}
          subtext={
            (fitbitConnectionStatus.fitbitUserId
              ? $_('settings_wellness.fitbit_deep.fitbit_id', { values: { id: fitbitConnectionStatus.fitbitUserId } })
              : $_('settings_wellness.fitbit.linked_via_google'))
            + (fitbitConnectionStatus.googleUserId ? ' · ' + $_('settings_wellness.fitbit_deep.google_user', { values: { id: fitbitConnectionStatus.googleUserId } }) : '')
          }
        >
          <svelte:fragment slot="action">
            <button class="status-retest" on:click={syncFitbitNow} disabled={syncingFitbit}>
              {syncingFitbit ? $_('settings_wellness.common.syncing') : $_('settings_wellness.common.sync')}
            </button>
            <button class="status-retest status-danger" on:click={disconnectFitbitFromSettings} disabled={disconnectingFitbit}>
              {disconnectingFitbit ? $_('settings_wellness.common.disconnecting') : $_('settings_wellness.common.disconnect')}
            </button>
          </svelte:fragment>
        </ConnectionStatus>
      {/if}
      {#if isNativeLocal}
        <div class="setting-row">
          <div>
            <span class="setting-label" style="opacity:0.5">{$_('settings_wellness.fitbit.enable')}</span>
            <div class="setting-desc">{$_('settings_wellness.fitbit_deep.server_only')}</div>
          </div>
        </div>
      {:else if fitbitEnabledVal || legacyFitbitConnected}
      <!-- User already has Fitbit turned on (or has legacy tokens mid-migration).
           Keep the toggle so they can manage / disconnect. -->
      <div class="setting-row">
        <div>
          <span class="setting-label">{$_('settings_wellness.fitbit.enable')}</span>
          <div class="setting-desc">{$_('settings_wellness.fitbit_deep.legacy_desc')}</div>
        </div>
        <Toggle checked={fitbitEnabledVal} on:change={e => { fitbitEnabledVal = e.detail; fitbitEnabled.set(e.detail); }} />
      </div>
      {:else}
      <!-- No prior Fitbit relationship: hide the connect entry point.
           Fitbit Web API is being retired; direct new users to Google Health. -->
      <div class="setting-row">
        <div>
          <span class="setting-label" style="opacity:0.6">{$_('settings_wellness.fitbit.retired_label')}</span>
          <div class="setting-desc">{$_('settings_wellness.fitbit_deep.retired_desc')}</div>
        </div>
      </div>
      {/if}

      {#if fitbitEnabledVal}
        <div class="setting-divider"></div>
        <div class="setting-row" style="align-items:flex-start;flex-direction:column;gap:8px">
          <div>
            <span class="setting-label">{$_('settings_wellness.common.sync_range')}</span>
            <div class="setting-desc">{$_('settings_wellness.common.sync_range_desc_fitbit')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div class="chip-group">
              {#each SYNC_RANGE_RECOMMENDED as opt}
                <button class="chip" class:chip-active={wellnessSyncRangeVal === opt.value}
                  on:click={() => { wellnessSyncRangeVal = opt.value; wellnessSyncRange.set(opt.value); }}
                >{$_(opt.label)}</button>
              {/each}
            </div>
            <div class="chip-group">
              {#each SYNC_RANGE_ADVANCED_FITBIT as opt}
                <button class="chip" class:chip-active={wellnessSyncRangeVal === opt.value}
                  on:click={() => { wellnessSyncRangeVal = opt.value; wellnessSyncRange.set(opt.value); }}
                >{$_(opt.label)} ⚠</button>
              {/each}
              <div style="display:flex;align-items:center;gap:4px;margin-left:4px">
                <input class="input" type="number" min="1" max={CUSTOM_MAX_FITBIT} style="width:64px;height:32px;padding:0 8px;font-size:13px;text-align:center"
                  class:input-active={!SYNC_RANGE_ALL_VALUES.has(wellnessSyncRangeVal)}
                  value={wellnessSyncRangeVal}
                  on:change={e => { const v = Math.max(1, Math.min(CUSTOM_MAX_FITBIT, parseInt(e.target.value)||1)); wellnessSyncRangeVal = v; wellnessSyncRange.set(v); }}
                  placeholder={$_('settings_wellness.common.custom_days_ph')} title={$_('settings_wellness.common.custom_days_title', { values: { max: CUSTOM_MAX_FITBIT } })} />
                <span class="setting-desc" style="margin:0">{$_('settings_wellness.common.days')}</span>
              </div>
            </div>
            <div class="setting-desc" style="font-size:11px;opacity:0.75">{$_('settings_wellness.fitbit.long_range_warn')}</div>
          </div>
        </div>
        <div class="setting-divider"></div>
        <div class="setting-row">
          <span class="setting-label">{$_('settings_wellness.common.sync_mode')}</span>
          <div class="select-wrap" style="width:150px">
            <select class="select sel-sm" bind:value={fitbitSyncModeVal} on:change={e => fitbitSyncMode.set(e.target.value)}>
              <option value="auto">{$_('settings_wellness.common.mode_auto')}</option>
              <option value="manual">{$_('settings_wellness.common.mode_manual')}</option>
              {#if !isNativeLocal}<option value="scheduled">{$_('settings_wellness.common.mode_scheduled')}</option>{/if}
            </select>
          </div>
        </div>
        {#if fitbitSyncModeVal === 'scheduled'}
          <div class="setting-divider"></div>
          <div class="setting-row">
            <span class="setting-label">{$_('settings_wellness.common.interval')}</span>
            <div class="select-wrap" style="width:160px">
              <select class="select sel-sm" bind:value={fitbitSyncIntervalVal} on:change={e => fitbitSyncInterval.set(parseInt(e.target.value))}>
                {#each SYNC_INTERVALS as opt}<option value={opt.value}>{$_(opt.label)}</option>{/each}
              </select>
            </div>
          </div>
          <div class="setting-divider"></div>
          {#if fitbitSyncIntervalVal >= 1440}
            <div class="setting-row">
              <span class="setting-label">{$_('settings_wellness.common.sync_at')}</span>
              <TimePicker value={fitbitSyncWindowStartVal || '14:00'} on:change={e => { fitbitSyncWindowStartVal = e.detail; fitbitSyncWindowStart.set(e.detail); fitbitSyncWindowEnd.set(null); }} />
            </div>
          {:else}
            <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:8px">
              <div>
                <span class="setting-label">{$_('settings_wellness.common.active_window')}</span>
                <div class="setting-desc">{$_('settings_wellness.common.active_window_desc')}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <TimePicker value={fitbitSyncWindowStartVal} placeholder={$_('settings_wellness.common.time_start')} on:change={e => { fitbitSyncWindowStartVal = e.detail; fitbitSyncWindowStart.set(e.detail || null); }} />
                <span style="color:var(--text-3)">{$_('settings_wellness.common.time_range_sep')}</span>
                <TimePicker value={fitbitSyncWindowEndVal} placeholder={$_('settings_wellness.common.time_end')} on:change={e => { fitbitSyncWindowEndVal = e.detail; fitbitSyncWindowEnd.set(e.detail || null); }} />
              </div>
            </div>
          {/if}
        {/if}
        <div class="setting-divider"></div>
        {#if legacyFitbitConnected}
          <!-- User is on the legacy dev.fitbit.com OAuth flow. Their tokens
               keep working until they expire OR the Sept 2026 cutoff,
               whichever comes first. Soft-prompt to re-link via the new
               Google Health pipe. -->
          <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:8px;background:var(--surface-2);padding:12px;border-radius:var(--radius-sm)">
            <div>
              <span class="setting-label">{$_('settings_wellness.fitbit_deep.relink_label')}</span>
              <div class="setting-desc" style="line-height:1.5">
                {@html $_('settings_wellness.fitbit_deep.relink_desc')}
              </div>
            </div>
            <button class="btn btn-primary" style="height:32px;padding:0 12px;font-size:13px"
              on:click={() => { fitbitEditingCreds = true; fitbitConnectionStatus = { connected: false, configured: false }; }}>
              {$_('settings_wellness.fitbit.relink_button')}
            </button>
          </div>
        {/if}
        {#if fitbitConnectionStatus === null}
          <div class="setting-row">
            <span class="setting-desc">{$_('settings_wellness.common.loading_status')}</span>
          </div>
        {:else if fitbitConnectionStatus.connected}
          {#if lastSyncResult}
            <div class="text-3 text-sm" style="padding:6px 12px;background:var(--surface-2);border-bottom:1px solid var(--border)">
              {#if lastSyncResult.ok}
                <span style="color:var(--macro-carbs)">{$_('settings_wellness.common.last_sync_ok', { values: { count: lastSyncResult.count, date: lastSyncResult.date } })}</span>
              {:else}
                <span style="color:#FF7070">{$_('settings_wellness.common.last_sync_error', { values: { error: localizeError(lastSyncResult.error) } })}</span>
              {/if}
            </div>
          {/if}
        {:else if fitbitConnectionStatus.configured && !fitbitEditingCreds}
          <div class="setting-row">
            <div>
              <span class="setting-label">{$_('settings_wellness.common.not_connected')}</span>
              <div class="setting-desc">{$_('settings_wellness.fitbit_deep.authorize_desc')}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn btn-ghost" style="height:32px;padding:0 10px;font-size:13px" on:click={() => fitbitEditingCreds = true} title={$_('settings_wellness.common.change_creds_title')}>
                <span class="material-symbols-rounded" style="font-size:16px">edit</span>
              </button>
              <button class="btn btn-primary" style="height:32px;padding:0 12px;font-size:13px" on:click={connectFitbitFromSettings} disabled={connectingFitbit}>
                {connectingFitbit ? $_('settings_wellness.common.connecting') : $_('settings_wellness.common.connect')}
              </button>
            </div>
          </div>
        {:else}
          <!-- No credentials yet — show inline setup form. As of late 2026
               Fitbit setup uses Google Cloud Console (dev.fitbit.com no
               longer accepts new app registrations). -->
          <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:12px">
            <div>
              <span class="setting-label">{$_('settings_wellness.common.api_credentials')}</span>
              <div class="setting-desc" style="line-height:1.5">
                {$_('settings_wellness.fitbit_deep.setup_desc')}
                <a href="https://developers.google.com/health/setup" target="_blank" rel="noopener" class="about-link">{$_('settings_wellness.fitbit_deep.setup_link')}</a>
              </div>
            </div>
            <div style="width:100%;display:flex;flex-direction:column;gap:8px">
              <div class="form-group" style="margin:0">
                <label class="form-label">{$_('settings_wellness.common.client_id')}</label>
                <input class="input" type="text" autocomplete="off" placeholder={$_('settings_wellness.fitbit_deep.client_id_ph')}
                  bind:value={fitbitClientId} />
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">{$_('settings_wellness.common.client_secret')}</label>
                <div style="display:flex;gap:6px">
                  {#if fitbitShowSecret}
                    <input class="input" type="text" autocomplete="new-password" placeholder="••••••••" bind:value={fitbitClientSecret} style="flex:1" />
                  {:else}
                    <input class="input" type="password" autocomplete="new-password" placeholder="••••••••" bind:value={fitbitClientSecret} style="flex:1" />
                  {/if}
                  <button class="btn-icon" on:click={() => fitbitShowSecret = !fitbitShowSecret} title={fitbitShowSecret ? $_('settings_wellness.common.hide') : $_('settings_wellness.common.show')}>
                    <span class="material-symbols-rounded">{fitbitShowSecret ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">{$_('settings_wellness.common.redirect_uri')}</label>
                <div class="setting-desc" style="margin-bottom:4px">{$_('settings_wellness.fitbit_deep.redirect_note')}</div>
                <div style="display:flex;gap:6px">
                  <input class="input" type="url" placeholder={fitbitRedirectSuggested} bind:value={fitbitRedirectUri} style="flex:1;font-size:12px" />
                  <button class="btn-icon" title={$_('settings_wellness.common.use_suggested')} on:click={() => fitbitRedirectUri = fitbitRedirectSuggested}><span class="material-symbols-rounded">auto_awesome</span></button>
                  <button class="btn-icon" on:click={copyRedirectUri} title={$_('settings_wellness.common.copy_uri')}><span class="material-symbols-rounded">content_copy</span></button>
                </div>
                <div class="setting-desc" style="font-size:11px;margin-top:2px">{$_('settings_wellness.fitbit_deep.redirect_format')} <code style="font-size:11px">https://your-domain.com/api/wellness/google-health/callback</code></div>
              </div>
              <button class="btn btn-primary" style="align-self:flex-end" on:click={saveFitbitConfig}>{fitbitEditingCreds ? $_('settings_wellness.common.save') : $_('settings_wellness.common.save_and_connect')}</button>
            </div>
          </div>
        {/if}
        <div class="setting-divider"></div>
        <div class="setting-row" style="align-items:flex-start;flex-direction:column;gap:8px">
          <span class="setting-label">{$_('settings_wellness.common.visible_metrics')}</span>
          <div class="chip-group" style="flex-wrap:wrap;gap:6px">
            {#each FITBIT_METRICS as m}
              <button class="chip" class:chip-active={$wellnessMetrics == null || $wellnessMetrics.includes(m.id)}
                on:click={() => toggleWellnessMetric(m.id)}>{$_(m.label)}</button>
            {/each}
          </div>
        </div>
        <div class="setting-divider"></div>
        <div class="setting-row">
          <div>
            <span class="setting-label">{$_('settings_wellness.common.workout_history')}</span>
            <div class="setting-desc">{$_('settings_wellness.common.workout_history_desc')}</div>
          </div>
          <Toggle checked={workoutsEnabledVal} on:change={e => { workoutsEnabledVal = e.detail; workoutsEnabled.set(e.detail); }} />
        </div>
      {/if}
    </div>

    <!-- ── Garmin (Experimental) ── -->
    <p class="sub-label" style="padding-top:16px">
      {$_('settings_wellness.garmin.title')}
      <span class="labs-badge" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">{$_('settings_wellness.common.experimental')}</span>
    </p>
    <div class="card settings-card">
      {#if !isNativeLocal && garminEnabledVal && garminConnectionStatus?.connected}
        <ConnectionStatus
          status="ok"
          okLabel={$_('settings_wellness.common.linked')}
          subtext={
            (garminConnectionStatus.garminUserId || $_('settings_wellness.garmin_deep.account_linked'))
            + (garminConnectionStatus.lastSyncedAt ? ' · ' + $_('settings_wellness.common.last_synced_ago', { values: { ago: _timeAgo(garminConnectionStatus.lastSyncedAt) } }) : '')
          }
        >
          <svelte:fragment slot="action">
            <button class="status-retest" on:click={syncGarminNow} disabled={syncingGarmin}>
              {syncingGarmin ? $_('settings_wellness.common.syncing') : $_('settings_wellness.common.sync')}
            </button>
            <button class="status-retest status-danger" on:click={disconnectGarminFromSettings} disabled={disconnectingGarmin}>
              {disconnectingGarmin ? $_('settings_wellness.common.disconnecting') : $_('settings_wellness.common.disconnect')}
            </button>
          </svelte:fragment>
        </ConnectionStatus>
      {/if}
      {#if isNativeLocal}
        <div class="setting-row">
          <div>
            <span class="setting-label" style="opacity:0.5">{$_('settings_wellness.garmin.enable')}</span>
            <div class="setting-desc">{$_('settings_wellness.garmin_deep.server_only')}</div>
          </div>
        </div>
      {:else}
      <div class="setting-row">
        <div>
          <span class="setting-label">{$_('settings_wellness.garmin.enable')}</span>
          <div class="setting-desc">
            {$_('settings_wellness.garmin_deep.metrics_desc')}
            <a href="https://developer.garmin.com/gc-developer-program/health-api/" target="_blank" rel="noopener" class="about-link">{$_('settings_wellness.garmin.apply_link')}</a>
          </div>
        </div>
        <Toggle checked={garminEnabledVal} on:change={e => { garminEnabledVal = e.detail; garminEnabled.set(e.detail); loadWellnessConfig(); }} />
      </div>
      {/if}

      {#if garminEnabledVal && !isNativeLocal}
        <div class="setting-divider"></div>
        <div class="setting-row" style="align-items:flex-start;flex-direction:column;gap:8px">
          <div>
            <span class="setting-label">{$_('settings_wellness.common.sync_range')}</span>
            <div class="setting-desc">{$_('settings_wellness.common.sync_range_desc')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div class="chip-group">
              {#each SYNC_RANGE_RECOMMENDED as opt}
                <button class="chip" class:chip-active={garminSyncRangeVal === opt.value}
                  on:click={() => { garminSyncRangeVal = opt.value; garminSyncRange.set(opt.value); }}
                >{$_(opt.label)}</button>
              {/each}
            </div>
            <div class="chip-group">
              {#each SYNC_RANGE_ADVANCED_GARMIN as opt}
                <button class="chip" class:chip-active={garminSyncRangeVal === opt.value}
                  on:click={() => { garminSyncRangeVal = opt.value; garminSyncRange.set(opt.value); }}
                >{$_(opt.label)} ⚠</button>
              {/each}
              <div style="display:flex;align-items:center;gap:4px;margin-left:4px">
                <input class="input" type="number" min="1" max={CUSTOM_MAX_GARMIN} style="width:64px;height:32px;padding:0 8px;font-size:13px;text-align:center"
                  class:input-active={!SYNC_RANGE_ALL_VALUES.has(garminSyncRangeVal)}
                  value={garminSyncRangeVal}
                  on:change={e => { const v = Math.max(1, Math.min(CUSTOM_MAX_GARMIN, parseInt(e.target.value)||1)); garminSyncRangeVal = v; garminSyncRange.set(v); }}
                  placeholder={$_('settings_wellness.common.custom_days_ph')} title={$_('settings_wellness.common.custom_days_title', { values: { max: CUSTOM_MAX_GARMIN } })} />
                <span class="setting-desc" style="margin:0">{$_('settings_wellness.common.days')}</span>
              </div>
            </div>
            <div class="setting-desc" style="font-size:11px;opacity:0.75">{$_('settings_wellness.garmin_deep.long_range_warn_full')}</div>
          </div>
        </div>
        <div class="setting-divider"></div>
        <div class="setting-row">
          <span class="setting-label">{$_('settings_wellness.common.sync_mode')}</span>
          <div class="select-wrap" style="width:150px">
            <select class="select sel-sm" bind:value={garminSyncModeVal} on:change={e => garminSyncMode.set(e.target.value)}>
              <option value="auto">{$_('settings_wellness.common.mode_auto')}</option>
              <option value="manual">{$_('settings_wellness.common.mode_manual')}</option>
              {#if !isNativeLocal}<option value="scheduled">{$_('settings_wellness.common.mode_scheduled')}</option>{/if}
            </select>
          </div>
        </div>
        {#if garminSyncModeVal === 'scheduled'}
          <div class="setting-divider"></div>
          <div class="setting-row">
            <span class="setting-label">{$_('settings_wellness.common.interval')}</span>
            <div class="select-wrap" style="width:160px">
              <select class="select sel-sm" bind:value={garminSyncIntervalVal} on:change={e => garminSyncInterval.set(parseInt(e.target.value))}>
                {#each SYNC_INTERVALS as opt}<option value={opt.value}>{$_(opt.label)}</option>{/each}
              </select>
            </div>
          </div>
          <div class="setting-divider"></div>
          {#if garminSyncIntervalVal >= 1440}
            <div class="setting-row">
              <span class="setting-label">{$_('settings_wellness.common.sync_at')}</span>
              <TimePicker value={garminSyncWindowStartVal || '14:00'} on:change={e => { garminSyncWindowStartVal = e.detail; garminSyncWindowStart.set(e.detail); garminSyncWindowEnd.set(null); }} />
            </div>
          {:else}
            <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:8px">
              <div>
                <span class="setting-label">{$_('settings_wellness.common.active_window')}</span>
                <div class="setting-desc">{$_('settings_wellness.common.active_window_desc')}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <TimePicker value={garminSyncWindowStartVal} placeholder={$_('settings_wellness.common.time_start')} on:change={e => { garminSyncWindowStartVal = e.detail; garminSyncWindowStart.set(e.detail || null); }} />
                <span style="color:var(--text-3)">{$_('settings_wellness.common.time_range_sep')}</span>
                <TimePicker value={garminSyncWindowEndVal} placeholder={$_('settings_wellness.common.time_end')} on:change={e => { garminSyncWindowEndVal = e.detail; garminSyncWindowEnd.set(e.detail || null); }} />
              </div>
            </div>
          {/if}
        {/if}
        <div class="setting-divider"></div>
        {#if garminConnectionStatus === null}
          <div class="setting-row">
            <span class="setting-desc">{$_('settings_wellness.common.loading_status')}</span>
          </div>
        {:else if garminConnectionStatus.connected}
          <!-- Connected state rendered as the top-of-card banner; nothing else here. -->
        {:else if garminConnectionStatus.configured && !garminEditingCreds}
          <div class="setting-row">
            <div>
              <span class="setting-label">{$_('settings_wellness.common.not_connected')}</span>
              <div class="setting-desc">{$_('settings_wellness.garmin_deep.authorize_desc')}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn btn-ghost" style="height:32px;padding:0 10px;font-size:13px" on:click={() => garminEditingCreds = true} title={$_('settings_wellness.common.change_creds_title')}>
                <span class="material-symbols-rounded" style="font-size:16px">edit</span>
              </button>
              <button class="btn btn-primary" style="height:32px;padding:0 12px;font-size:13px" on:click={connectGarminFromSettings} disabled={connectingGarmin}>
                {connectingGarmin ? $_('settings_wellness.common.connecting') : $_('settings_wellness.common.connect')}
              </button>
            </div>
          </div>
        {:else}
          <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:12px">
            <div>
              <span class="setting-label">{$_('settings_wellness.common.api_credentials')}</span>
              <div class="setting-desc" style="line-height:1.4">
                {$_('settings_wellness.garmin.creds_desc')}
                <a href="https://developer.garmin.com/gc-developer-program/health-api/" target="_blank" rel="noopener" class="about-link">{$_('settings_wellness.garmin.creds_link')}</a>
              </div>
            </div>
            <div style="width:100%;display:flex;flex-direction:column;gap:8px">
              <div class="form-group" style="margin:0">
                <label class="form-label">{$_('settings_wellness.common.consumer_key')}</label>
                <input class="input" type="text" autocomplete="off" placeholder={$_('settings_wellness.common.consumer_key_ph')}
                  bind:value={garminConsumerKey} />
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">{$_('settings_wellness.common.consumer_secret')}</label>
                <div style="display:flex;gap:6px">
                  {#if garminShowSecret}
                    <input class="input" type="text" autocomplete="new-password" placeholder="••••••••" bind:value={garminConsumerSecret} style="flex:1" />
                  {:else}
                    <input class="input" type="password" autocomplete="new-password" placeholder="••••••••" bind:value={garminConsumerSecret} style="flex:1" />
                  {/if}
                  <button class="btn-icon" on:click={() => garminShowSecret = !garminShowSecret} title={garminShowSecret ? $_('settings_wellness.common.hide') : $_('settings_wellness.common.show')}>
                    <span class="material-symbols-rounded">{garminShowSecret ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">{$_('settings_wellness.common.redirect_uri')}</label>
                <div class="setting-desc" style="margin-bottom:4px">{$_('settings_wellness.common.register_uri_note')}</div>
                <div style="display:flex;gap:6px">
                  <input class="input" type="url" placeholder={garminRedirectSuggested} bind:value={garminRedirectUri} style="flex:1;font-size:12px" />
                  <button class="btn-icon" title={$_('settings_wellness.common.use_suggested')} on:click={() => garminRedirectUri = garminRedirectSuggested}><span class="material-symbols-rounded">auto_awesome</span></button>
                  <button class="btn-icon" on:click={copyGarminRedirectUri} title={$_('settings_wellness.common.copy_uri')}><span class="material-symbols-rounded">content_copy</span></button>
                </div>
                <div class="setting-desc" style="font-size:11px;margin-top:2px">{$_('settings_wellness.fitbit_deep.redirect_format')} <code style="font-size:11px">https://your-domain.com/api/wellness/garmin/callback</code></div>
              </div>
              <button class="btn btn-primary" style="align-self:flex-end" on:click={saveGarminConfig}>{garminEditingCreds ? $_('settings_wellness.common.save') : $_('settings_wellness.common.save_and_connect')}</button>
            </div>
          </div>
        {/if}
        <div class="setting-divider"></div>
        <div class="setting-row" style="align-items:flex-start;flex-direction:column;gap:8px">
          <span class="setting-label">{$_('settings_wellness.common.visible_metrics')}</span>
          <div class="chip-group" style="flex-wrap:wrap;gap:6px">
            {#each GARMIN_METRICS as m}
              <button class="chip" class:chip-active={$wellnessMetrics == null || $wellnessMetrics.includes(m.id)}
                on:click={() => toggleWellnessMetric(m.id)}>{$_(m.label)}</button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- ── Withings ── -->
    <p class="sub-label" style="padding-top:16px">{$_('settings_wellness.withings.title')}</p>
    <div class="card settings-card">
      {#if !isNativeLocal && withingsEnabledVal && withingsConnectionStatus?.connected}
        <ConnectionStatus
          status="ok"
          okLabel={$_('settings_wellness.common.linked')}
          subtext={
            (withingsConnectionStatus.withingsUserId ? $_('settings_wellness.withings_deep.user', { values: { id: withingsConnectionStatus.withingsUserId } }) : $_('settings_wellness.withings_deep.account_linked'))
            + (withingsConnectionStatus.lastSyncedAt ? ' · ' + $_('settings_wellness.common.last_synced_ago', { values: { ago: _timeAgo(withingsConnectionStatus.lastSyncedAt) } }) : '')
          }
        >
          <svelte:fragment slot="action">
            <button class="status-retest" on:click={syncWithingsNow} disabled={syncingWithings}>
              {syncingWithings ? $_('settings_wellness.common.syncing') : $_('settings_wellness.common.sync')}
            </button>
            <button class="status-retest status-danger" on:click={disconnectWithingsFromSettings} disabled={disconnectingWithings}>
              {disconnectingWithings ? $_('settings_wellness.common.disconnecting') : $_('settings_wellness.common.disconnect')}
            </button>
          </svelte:fragment>
        </ConnectionStatus>
      {/if}
      {#if isNativeLocal}
        <div class="setting-row">
          <div>
            <span class="setting-label" style="opacity:0.5">{$_('settings_wellness.withings.enable')}</span>
            <div class="setting-desc">{$_('settings_wellness.withings_deep.server_only')}</div>
          </div>
        </div>
      {:else}
      <div class="setting-row">
        <div>
          <span class="setting-label">{$_('settings_wellness.withings.enable')}</span>
          <div class="setting-desc">
            {$_('settings_wellness.withings.enable_desc')}
            <a href="https://developer.withings.com/dashboard/" target="_blank" rel="noopener" class="about-link">{$_('settings_wellness.withings.dashboard_link')}</a>
          </div>
        </div>
        <Toggle checked={withingsEnabledVal} on:change={e => { withingsEnabledVal = e.detail; withingsEnabled.set(e.detail); }} />
      </div>
      {/if}

      {#if withingsEnabledVal && !isNativeLocal}
        <div class="setting-divider"></div>
        <div class="setting-row" style="align-items:flex-start;flex-direction:column;gap:8px">
          <div>
            <span class="setting-label">{$_('settings_wellness.common.sync_range')}</span>
            <div class="setting-desc">{$_('settings_wellness.common.sync_range_desc')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div class="chip-group">
              {#each SYNC_RANGE_RECOMMENDED as opt}
                <button class="chip" class:chip-active={withingsSyncRangeVal === opt.value}
                  on:click={() => { withingsSyncRangeVal = opt.value; withingsSyncRange.set(opt.value); }}
                >{$_(opt.label)}</button>
              {/each}
            </div>
            <div class="chip-group">
              {#each SYNC_RANGE_ADVANCED_WITHINGS as opt}
                <button class="chip" class:chip-active={withingsSyncRangeVal === opt.value}
                  on:click={() => { withingsSyncRangeVal = opt.value; withingsSyncRange.set(opt.value); }}
                >{$_(opt.label)} ⚠</button>
              {/each}
              <div style="display:flex;align-items:center;gap:4px;margin-left:4px">
                <input class="input" type="number" min="1" max={CUSTOM_MAX_WITHINGS} style="width:64px;height:32px;padding:0 8px;font-size:13px;text-align:center"
                  class:input-active={!SYNC_RANGE_ALL_VALUES.has(withingsSyncRangeVal)}
                  value={withingsSyncRangeVal}
                on:change={e => { const v = Math.max(1, Math.min(CUSTOM_MAX_WITHINGS, parseInt(e.target.value)||1)); withingsSyncRangeVal = v; withingsSyncRange.set(v); }}
                placeholder={$_('settings_wellness.common.custom_days_ph')} title={$_('settings_wellness.common.custom_days_title', { values: { max: CUSTOM_MAX_WITHINGS } })} />
              <span class="setting-desc" style="margin:0">{$_('settings_wellness.common.days')}</span>
            </div>
            </div>
            <div class="setting-desc" style="font-size:11px;opacity:0.75">{$_('settings_wellness.withings.long_range_warn')}</div>
          </div>
        </div>
        <div class="setting-divider"></div>
        <div class="setting-row">
          <span class="setting-label">{$_('settings_wellness.common.sync_mode')}</span>
          <div class="select-wrap" style="width:150px">
            <select class="select sel-sm" bind:value={withingsSyncModeVal} on:change={e => withingsSyncMode.set(e.target.value)}>
              <option value="auto">{$_('settings_wellness.common.mode_auto')}</option>
              <option value="manual">{$_('settings_wellness.common.mode_manual')}</option>
              {#if !isNativeLocal}<option value="scheduled">{$_('settings_wellness.common.mode_scheduled')}</option>{/if}
            </select>
          </div>
        </div>
        {#if withingsSyncModeVal === 'scheduled'}
          <div class="setting-divider"></div>
          <div class="setting-row">
            <span class="setting-label">{$_('settings_wellness.common.interval')}</span>
            <div class="select-wrap" style="width:160px">
              <select class="select sel-sm" bind:value={withingsSyncIntervalVal} on:change={e => withingsSyncInterval.set(parseInt(e.target.value))}>
                {#each SYNC_INTERVALS as opt}<option value={opt.value}>{$_(opt.label)}</option>{/each}
              </select>
            </div>
          </div>
          <div class="setting-divider"></div>
          {#if withingsSyncIntervalVal >= 1440}
            <div class="setting-row">
              <span class="setting-label">{$_('settings_wellness.common.sync_at')}</span>
              <TimePicker value={withingsSyncWindowStartVal || '14:00'} on:change={e => { withingsSyncWindowStartVal = e.detail; withingsSyncWindowStart.set(e.detail); withingsSyncWindowEnd.set(null); }} />
            </div>
          {:else}
            <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:8px">
              <div>
                <span class="setting-label">{$_('settings_wellness.common.active_window')}</span>
                <div class="setting-desc">{$_('settings_wellness.common.active_window_desc')}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <TimePicker value={withingsSyncWindowStartVal} placeholder={$_('settings_wellness.common.time_start')} on:change={e => { withingsSyncWindowStartVal = e.detail; withingsSyncWindowStart.set(e.detail || null); }} />
                <span style="color:var(--text-3)">{$_('settings_wellness.common.time_range_sep')}</span>
                <TimePicker value={withingsSyncWindowEndVal} placeholder={$_('settings_wellness.common.time_end')} on:change={e => { withingsSyncWindowEndVal = e.detail; withingsSyncWindowEnd.set(e.detail || null); }} />
              </div>
            </div>
          {/if}
        {/if}
        <div class="setting-divider"></div>
        {#if withingsConnectionStatus === null}
          <div class="setting-row">
            <span class="setting-desc">{$_('settings_wellness.common.loading_status')}</span>
          </div>
        {:else if withingsConnectionStatus.connected}
          <!-- Connected state rendered as the top-of-card banner; nothing else here. -->
        {:else if withingsConnectionStatus.configured && !withingsEditingCreds}
          <div class="setting-row">
            <div>
              <span class="setting-label">{$_('settings_wellness.common.not_connected')}</span>
              <div class="setting-desc">{$_('settings_wellness.withings_deep.authorize_desc')}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn btn-ghost" style="height:32px;padding:0 10px;font-size:13px" on:click={() => withingsEditingCreds = true} title={$_('settings_wellness.common.change_creds_title')}>
                <span class="material-symbols-rounded" style="font-size:16px">edit</span>
              </button>
              <button class="btn btn-primary" style="height:32px;padding:0 12px;font-size:13px" on:click={connectWithingsFromSettings} disabled={connectingWithings}>
                {connectingWithings ? $_('settings_wellness.common.connecting') : $_('settings_wellness.common.connect')}
              </button>
            </div>
          </div>
        {:else}
          <!-- No credentials yet — show inline setup form -->
          <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:12px">
            <div>
              <span class="setting-label">{$_('settings_wellness.common.api_credentials')}</span>
              <div class="setting-desc" style="line-height:1.4">
                {$_('settings_wellness.withings_deep.creds_desc_full')}
                <a href="https://developer.withings.com/dashboard/" target="_blank" rel="noopener" class="about-link">{$_('settings_wellness.withings_deep.dashboard_link_full')}</a>
              </div>
            </div>
            <div style="width:100%;display:flex;flex-direction:column;gap:8px">
              <div class="form-group" style="margin:0">
                <label class="form-label">{$_('settings_wellness.common.client_id')}</label>
                <input class="input" type="text" autocomplete="off" placeholder={$_('settings_wellness.withings.client_id_placeholder')}
                  bind:value={withingsClientId} />
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">{$_('settings_wellness.common.client_secret')}</label>
                <div style="display:flex;gap:6px">
                  {#if withingsShowSecret}
                    <input class="input" type="text" autocomplete="new-password" placeholder="••••••••" bind:value={withingsClientSecret} style="flex:1" />
                  {:else}
                    <input class="input" type="password" autocomplete="new-password" placeholder="••••••••" bind:value={withingsClientSecret} style="flex:1" />
                  {/if}
                  <button class="btn-icon" on:click={() => withingsShowSecret = !withingsShowSecret} title={withingsShowSecret ? $_('settings_wellness.common.hide') : $_('settings_wellness.common.show')}>
                    <span class="material-symbols-rounded">{withingsShowSecret ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">{$_('settings_wellness.common.redirect_uri')}</label>
                <div class="setting-desc" style="margin-bottom:4px">{$_('settings_wellness.withings.redirect_help')}</div>
                <div style="display:flex;gap:6px">
                  <input class="input" type="url" placeholder={withingsRedirectSuggested} bind:value={withingsRedirectUri} style="flex:1;font-size:12px" />
                  <button class="btn-icon" title={$_('settings_wellness.common.use_suggested')} on:click={() => withingsRedirectUri = withingsRedirectSuggested}><span class="material-symbols-rounded">auto_awesome</span></button>
                  <button class="btn-icon" on:click={copyWithingsRedirectUri} title={$_('settings_wellness.common.copy_uri')}><span class="material-symbols-rounded">content_copy</span></button>
                </div>
                <div class="setting-desc" style="font-size:11px;margin-top:2px">{$_('settings_wellness.fitbit_deep.redirect_format')} <code style="font-size:11px">https://your-domain.com/api/wellness/withings/callback</code></div>
              </div>
              <button class="btn btn-primary" style="align-self:flex-end" on:click={saveWithingsConfig}>{withingsEditingCreds ? $_('settings_wellness.common.save') : $_('settings_wellness.common.save_and_connect')}</button>
            </div>
          </div>
        {/if}
        <div class="setting-divider"></div>
        <div class="setting-row" style="align-items:flex-start;flex-direction:column;gap:8px">
          <span class="setting-label">{$_('settings_wellness.common.visible_metrics')}</span>
          <div class="chip-group" style="flex-wrap:wrap;gap:6px">
            {#each WITHINGS_METRICS as m}
              <button class="chip" class:chip-active={$wellnessMetrics == null || $wellnessMetrics.includes(m.id)}
                on:click={() => toggleWellnessMetric(m.id)}>{$_(m.label)}</button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Health Connect (Android only) -->
    {#if isNative}
      <p class="sub-label" style="padding-top:16px">
        {$_('settings_wellness.hc.title')}
      </p>
      <div class="card settings-card">
        {#if healthConnectEnabledVal && healthConnectAvailability === 'Available'}
          <ConnectionStatus
            status="ok"
            okLabel={$_('settings_wellness.hc.permission_granted')}
            subtext={$_('settings_wellness.hc.data_types_readable_count', { values: { count: healthConnectPermissions.read.length } })}
          >
            <svelte:fragment slot="action">
              <button class="status-retest" on:click={syncHcNow} disabled={syncingHc}>
                {syncingHc ? $_('settings_wellness.common.syncing') : $_('settings_wellness.common.sync')}
              </button>
            </svelte:fragment>
          </ConnectionStatus>
        {:else if healthConnectEnabledVal && healthConnectAvailability === 'NotInstalled'}
          <ConnectionStatus
            status="fail"
            error={$_('settings_wellness.hc.not_installed')}
          />
        {/if}
        <div class="setting-row">
          <div>
            <span class="setting-label">{$_('settings_wellness.hc.enable_label')}</span>
            <div class="setting-desc">{$_('settings_wellness.hc.enable_desc')}</div>
          </div>
          <Toggle checked={healthConnectEnabledVal} on:change={async e => {
            const enabled = e.detail;
            if (enabled) {
              if (healthConnectAvailability !== 'Available') {
                showError(healthConnectAvailability === 'NotInstalled' ? $_('settings_wellness.hc.not_installed') : $_('settings_wellness.hc.not_supported'));
                return;
              }
              const { requestPermissions } = await import('../../lib/health-connect.js');
              const perms = await requestPermissions();
              if (perms.read.length === 0) {
                showError($_('settings_wellness.hc.perms_not_granted'));
              }
              healthConnectPermissions = perms;
              showSuccess($_('settings_wellness.hc.enabled_success', { values: { count: perms.read.length } }));
            }
            healthConnectEnabledVal = enabled;
            healthConnectEnabled.set(enabled);
          }} />
        </div>
        {#if healthConnectEnabledVal}
          {#if healthConnectAvailability !== 'Available' && healthConnectAvailability !== 'NotInstalled'}
            <div class="setting-divider"></div>
            <div class="setting-row">
              <div>
                <span class="setting-label">{$_('settings_wellness.hc.status_label')}</span>
                <div class="setting-desc" style="color:var(--text-3)">{$_('settings_wellness.hc.status_unsupported')}</div>
              </div>
            </div>
          {/if}
          <div class="setting-divider"></div>
          <div class="setting-row">
            <span class="setting-label">{$_('settings_wellness.common.sync_mode')}</span>
            <div class="select-wrap" style="width:150px">
              <select class="select sel-sm" bind:value={hcSyncModeVal} on:change={e => healthConnectSyncMode.set(e.target.value)}>
                <option value="auto">{$_('settings_wellness.common.mode_auto')}</option>
                <option value="manual">{$_('settings_wellness.common.mode_manual')}</option>
                <option value="scheduled">{$_('settings_wellness.hc.mode_scheduled')}</option>
              </select>
            </div>
          </div>
          {#if hcSyncModeVal === 'scheduled'}
            <div class="setting-divider"></div>
            <div class="setting-row">
              <span class="setting-label">{$_('settings_wellness.common.interval')}</span>
              <div class="select-wrap" style="width:160px">
                <select class="select sel-sm" bind:value={hcSyncIntervalVal} on:change={e => healthConnectSyncInterval.set(parseInt(e.target.value))}>
                  {#each SYNC_INTERVALS as opt}<option value={opt.value}>{$_(opt.label)}</option>{/each}
                </select>
              </div>
            </div>
            <div class="setting-divider"></div>
            {#if hcSyncIntervalVal >= 1440}
              <div class="setting-row">
                <span class="setting-label">{$_('settings_wellness.common.sync_at')}</span>
                <TimePicker value={hcSyncWindowStartVal || '14:00'} on:change={e => { hcSyncWindowStartVal = e.detail; healthConnectSyncWindowStart.set(e.detail); healthConnectSyncWindowEnd.set(null); }} />
              </div>
            {:else}
              <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:8px">
                <div>
                  <span class="setting-label">{$_('settings_wellness.common.active_window')}</span>
                  <div class="setting-desc">{$_('settings_wellness.common.active_window_desc')}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <TimePicker value={hcSyncWindowStartVal} placeholder={$_('settings_wellness.common.time_start')} on:change={e => { hcSyncWindowStartVal = e.detail; healthConnectSyncWindowStart.set(e.detail || null); }} />
                  <span style="color:var(--text-3)">{$_('settings_wellness.common.time_range_sep')}</span>
                  <TimePicker value={hcSyncWindowEndVal} placeholder={$_('settings_wellness.common.time_end')} on:change={e => { hcSyncWindowEndVal = e.detail; healthConnectSyncWindowEnd.set(e.detail || null); }} />
                </div>
              </div>
            {/if}
          {/if}
          <div class="setting-divider"></div>
          <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:6px">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:baseline;gap:8px">
              <span class="setting-label">{$_('settings_wellness.hc.bg_sync_label')}</span>
              <span style="color:var(--text-3);font-size:0.85em">{_formatRelative(hcLastBgSyncAt)}</span>
            </div>
            <div class="setting-desc">
              {$_('settings_wellness.hc.bg_sync_desc')}
            </div>
          </div>
          <div class="setting-divider"></div>
          <div class="setting-row" style="align-items:flex-start;flex-direction:column;gap:8px">
            <span class="setting-label">{$_('settings_wellness.common.visible_metrics')}</span>
            <div class="chip-group" style="flex-wrap:wrap;gap:6px">
              {#each HC_METRICS as m}
                <button class="chip" class:chip-active={$wellnessMetrics == null || $wellnessMetrics.includes(m.id)}
                  on:click={() => toggleWellnessMetric(m.id)}>{$_(m.label)}</button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- LiftTrace cross-source workout reconciliation. Renders only when
         BOTH a wearable that reports daily calorie totals is enabled AND
         a LiftTrace API token is active for this user (lifttrace_connected
         from /api/app-config/env-locks, which checks for a non-expired
         api_tokens row with write:workouts scope). Without both halves
         the conflict the toggle resolves cannot occur, so the toggle
         would just be UI noise. Lives in its own sub-section at the
         bottom of the wellness group so the placement reads as
         cross-cutting rather than nested under any one wearable. -->
    {#if (fitbitEnabledVal || garminEnabledVal || withingsEnabledVal || healthConnectEnabledVal) && $envLocks?.lifttrace_connected}
      <p class="sub-label" style="padding-top:16px">{$_('settings_wellness.lifttrace.title')}</p>
      <div class="card settings-card">
        <div class="setting-row">
          <div>
            <span class="setting-label">{$_('settings_wellness.lifttrace_ovr.prefer_label')}</span>
            <div class="setting-desc">{$_('settings_wellness.lifttrace_ovr.prefer_desc')}</div>
          </div>
          <Toggle checked={lifttraceOverlapFillVal} on:change={e => { lifttraceOverlapFillVal = e.detail; lifttraceOverlapFill.set(e.detail); }} />
        </div>
      </div>
    {/if}

    <!-- Global metric reset — sits at the very end of the wellness group so
         users understand it applies across all providers, not just the last
         one shown. -->
    <div style="display:flex;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-secondary btn-sm" on:click={() => wellnessMetrics.set(null)}>
        {$_('settings_wellness.common.reset_visible_metrics')}
      </button>
    </div>
  {/if}

</div>

<style>
  /* Mirror Settings.svelte scoped styles so cards look identical */
  .section-body { padding: 12px var(--page-px); display: flex; flex-direction: column; gap: 10px; }
  .settings-card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .setting-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 16px;
    min-height: 50px;
  }
  .setting-label { font-size: 14px; font-weight: 500; flex: 1; }
  .setting-divider { height: 1px; background: var(--border); margin: 0 16px; }
  .sel-sm { height: 36px; font-size: 13px; }

  .sub-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-3);
    padding: 4px 2px 2px;
  }

  .form-group { display: flex; flex-direction: column; gap: 6px; }
  .form-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }

  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-width: 100%;
  }
  .chip {
    padding: 4px 12px;
    border-radius: 99px;
    border: 1.5px solid var(--border);
    background: transparent;
    color: var(--text-2);
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .chip:hover { border-color: var(--accent); color: var(--text-1); }
  .chip-active {
    border-color: var(--accent);
    background: var(--accent-dim);
    color: var(--accent);
    font-weight: 600;
  }
  .input-active {
    border-color: var(--accent);
    background: var(--accent-dim);
    color: var(--accent);
    font-weight: 600;
  }

  .labs-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: linear-gradient(135deg, #f59e0b, #ef4444);
    color: #fff;
    padding: 2px 6px;
    border-radius: 99px;
    margin-left: 6px;
    vertical-align: middle;
  }
</style>
