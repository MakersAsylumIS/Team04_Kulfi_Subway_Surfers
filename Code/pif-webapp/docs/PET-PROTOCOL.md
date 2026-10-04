# Pet Bluetooth protocol (v1)

> The byte-level contract between the app (central) and the pet (peripheral).
> The source of truth in code is [`src/pet/protocol.ts`](../src/pet/protocol.ts). Firmware
> implements this file. Change both together, and bump the version here.

The phone decides everything. The pet is told conclusions: which story to play, what to
show, when to buzz. **Audio and coordinates never cross the link.**

## Service and characteristics

All UUIDs share one base: `f404XXXX-a91e-4923-a44e-340a15cd58e5`.

| Name | UUID | Properties | Size |
|---|---|---|---|
| service | `f4040001-a91e-4923-a44e-340a15cd58e5` | primary, advertised | |
| `play` | `f4040002-…` | write (with response) | 3 to 34 B |
| `transport` | `f4040003-…` | write | 2 B |
| `now_showing` | `f4040004-…` | write | 2 to 80 B |
| `playback` | `f4040005-…` | notify | 3 B |
| `haptic` | `f4040006-…` | write | 1 B |
| `input` | `f4040007-…` | notify | 2 B |
| `peer_seen` | `f4040008-…` | notify | reserved, not used yet |

**Advertise the service UUID.** The app's device picker filters on it, so a pet that
doesn't advertise it won't show up. Request an MTU of at least 83 so `now_showing` fits in
one write. The app also works with long writes.

All multi-byte numbers are **little-endian**. Text is **UTF-8**.

## Writes (app → pet)

### `play`: play a story from the SD card

| Bytes | Field |
|---|---|
| 0–1 | `u16` start offset, seconds |
| 2… | story id, UTF-8, 1 to 32 bytes (no terminator; the length comes from the write) |

The pet plays `/stories/<id>.wav` (16-bit PCM, see HARDWARE.md section 9). A new `play`
replaces whatever is playing. If the file doesn't exist, notify `playback` with state
`3` (missing file). The app then plays the story on the phone instead, so a stale card
never means silence.

> Changed from the original 6-byte sketch in AGENTS.md: the id is sent as text, so the WAV
> files on the card are named exactly like the MP3s (`mahim-causeway-01.wav`), with no
> separate numbering to keep in sync.

### `transport`

| Byte 0 (command) | Byte 1 (argument) |
|---|---|
| `0` resume | unused |
| `1` pause | unused |
| `2` stop | unused |
| `3` volume | 0 to 100 |
| `4` output | `0` headphone jack, `1` speaker |

Answer resume, pause and stop with a `playback` notification.

### `now_showing`: what the round display draws

| Bytes | Field |
|---|---|
| 0 | `u8` `icon_id` (index into the icon set preloaded on the pet) |
| 1… | `place` + `\n` + `title`, UTF-8, cut to 80 bytes total on a character boundary |

The app sends this just before `play`. Draw `PLAYING` from it (HARDWARE.md section 10).

### `haptic`

| Byte 0 | Pattern |
|---|---|
| `0` | short (sent when a story starts) |
| `1` | double |
| `2` | long |

Without a motor, play a short chirp on the speaker instead.

## Notifications (pet → app)

### `playback`: keep the app in sync

| Bytes | Field |
|---|---|
| 0 | state: `0` idle, `1` playing, `2` paused, `3` missing file |
| 1–2 | `u16` position, seconds |

Send it when a story starts (state `1`), about once a second while playing, on pause or
resume, and **`0` when the story ends**. The app moves to the next story when it sees
idle after playing, so the end notification matters.

### `input`: touching the pet

| Byte 0 (event) | Meaning in the app |
|---|---|
| `1` pat | pause or resume the current story |
| `2` double-pat | skip the current story |
| `3` shake | reserved |
| `4` hold start | reserved |
| `5` hold end | reserved |

Byte 1 is reserved; send `0`.

## A story, end to end

```
app → now_showing   03 "Mahim\nThe road a widow paid for"
app → haptic        00
app → play          00 00 "mahim-causeway-01"
pet → playback      01 00 00          playing, 0 s
pet → playback      01 01 00          playing, 1 s   (about every second)
      … user pats the pet …
pet → input         01 00             pat
app → transport     01 00             pause
pet → playback      02 0c 00          paused, 12 s
      … story finishes …
pet → playback      00 28 00          idle, 40 s     → app moves on
```

## Testing without the app

Use **nRF Connect** (Android or iOS) as HARDWARE.md build step 8 says: connect, write
`00 00 6d 61 68 69 6d …` (offset 0 + `mahim…`) to `play`, and subscribe to `playback`.

## Testing the app without a pet

On the Start screen in simulation mode, tap **Use a fake pet (for testing)**. It decodes
these exact bytes and answers with these exact notifications, draws what the round display
would show, and has Pat and Double-pat buttons. Code: `src/pet/fakePet.ts`.
