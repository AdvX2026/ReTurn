# ReTurn Orange Pi demo checklist

## Day before

- [ ] The hotspot device, SSID, subnet, and power source are fixed.
- [ ] Pi, Mac, and iPhone have all joined the hotspot after a cold restart.
- [ ] Fixed IP `/api/ping` works from both Mac and iPhone.
- [ ] `return.local` works, or the client is already configured for fixed-IP fallback.
- [ ] `return-server.service` is enabled and active after a full Pi reboot.
- [ ] The deployed commit matches the reviewed demo commit.
- [ ] Root filesystem has at least 1 GiB available.
- [ ] Pi temperature and power remain stable during a one-hour run.
- [ ] No real secrets appear in Git, shell scripts, or service logs.
- [ ] HealthKit data reaches `/api/health` with the real health token.
- [ ] Voice upload returns a real transcript.
- [ ] Save returns `degraded: false` with the production model.
- [ ] At least one real previous day is saved for Continue.
- [ ] Sampler offline outbox and reconnect flush were tested without duplicates.
- [ ] A final backup was copied off the Pi to the maintenance Mac.
- [ ] The same server commit and restored backup can run on the fallback Mac.
- [ ] A backup demo video is available offline.

## Before going on stage

- [ ] Start the private hotspot.
- [ ] Power on the Pi and wait for normal boot.
- [ ] From the Mac, call the fixed-IP `/api/ping` endpoint.
- [ ] Check `systemctl is-active return-server` and recent journal errors.
- [ ] Confirm the sampler reports Pi online and outbox size zero.
- [ ] Open the iPhone once so HealthKit sync runs.
- [ ] Verify free disk space and create no new local backup unless necessary.
- [ ] Avoid a test Save on the real demo date.

## Fast fallback order

1. `return.local` failure: switch to the fixed IP.
2. UI cache/network issue: confirm `/api/ping`, then restart only the affected client.
3. Server process failure: inspect journald, then restart `return-server.service`.
4. Data failure: restore the verified final backup.
5. Pi hardware/storage failure: run the same commit and backup on the Mac.
6. External model or transcription outage: show existing real saved data and use
   the offline backup video; do not change providers live on stage.
