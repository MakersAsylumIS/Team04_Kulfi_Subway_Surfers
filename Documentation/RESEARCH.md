# Research and design process

How we got from a month of riding Mumbai to a story app with a pet, what the research
actually told us, and what we'd do differently. The day-by-day version is in the
[engineering log](ENGINEERING-LOG.md#research-findings).

**Residency:** Play it Forward, Kulfi Collective × Makers Asylum, cohort 06.
**Team:** Gayatri Sapre, Avantika Rikhye, Aarya Rokade. Mentor: Kushal.

| Phase | When | What |
|---|---|---|
| Pre-study | 18–31 August | Remote modules |
| Mumbai residency | September | Fieldwork, problem statement, concept |
| Goa build week | 1–7 October | Building the app and the pet at Makers Asylum |
| Showcase | mid-October | |

---

## 1. Fieldwork

**What we did:** one long multi-modal journey across the city (Lower Parel → Ghatkopar →
CSMT → Nariman Point → CSMT metro → Aarey JVLR → IIM Powai → Lower Parel), and nine
conversations with commuters.

**What it gave us:** the conversations mostly confirmed what we had already seen, and
surfaced nothing new.

**Why:** the question format, not the number of interviews. The script asked "what do you
notice? what do you ignore?", and nobody can report what they ignore. A regular commuter
asked about their commute gives the answer they've already rehearsed a hundred times.

**Methods that would have worked better:**

| Instead of | Try | Because |
|---|---|---|
| "Describe your commute" | "Walk me through exactly how you'd get from Ghatkopar to Nariman Point at 9 am tomorrow" | People can't tell you what they know, but they can perform it |
| Asking what people do | Counting it: earphones in vs sound actually playing; sleepers; eyes up vs eyes down | Behaviour is observable; opinion is rehearsed |
| Interviews | Probes: put a cheap fake thing into the world and watch | Behaviour disagrees with opinion more often than expected |

## 2. The genre has a graveyard

Location-based audio storytelling has been built many times:

- [**Detour**](https://medium.com/detour-dot-com/detour-the-next-chapter-6f1aa2d97a14): well
  funded and beautifully produced; absorbed by Bose in 2018 and shut down as a consumer product.
- [**VoiceMap**](https://voicemap.me/): survived by becoming a tourism platform; already has
  community authoring.
- [**Echoes**](https://echoes.xyz/): a free geolocated tour builder for anyone.

**The insight:** every product in this genre is built for someone's **first** visit. Our user is
on their **thousandth**. A commuter who has passed Dadar four thousand times does not want a tour
guide, and the tourism framing probably explains why the graveyard is so full: it doesn't
transfer to daily travel.

## 3. The strongest material: contradictions in our own notes

Three people rode the same city and came back disagreeing. Two of those disagreements were
worth more than any single observation:

| We wrote | And also | So |
|---|---|---|
| "No social connection" | "Everyone was helpful when I was lost" | Connection isn't absent, it's **gated**, and the entry condition is a legible need |
| Adults called the carriage boring | Kids loved the same carriage | Boredom isn't a property of the journey but of **repetition** |

## 4. From findings to the product

How the research shows up in what we built. (Where a finding is still an open question, it's
marked.)

| Finding | In the product |
|---|---|
| The user is on their thousandth trip, not their first | **Place-based, not tour-based**: no routes to follow, no guide voice. You hear about the place you're passing, whatever the transport ("If I'm near Bandra, regardless of transport, I must get to know about that place"). |
| Boredom comes from repetition | Each story fires **once per journey**. What happens on the hundredth pass is the **replay rules** question, still open ([OPEN-QUESTIONS.md](OPEN-QUESTIONS.md)). |
| Connection is gated behind a legible need | **No social layer**: no profiles, follows, comments or feeds. The one exchange between strangers is the pet-to-pet idea: a story id passed in a Bluetooth advertisement, no contact. |
| People have stopped noticing the city | The tone: **quiet and specific**, no gamification, streaks or points. The framing line: *we cross paths with thousands of people and hundreds of places every day, and know almost nothing about any of them.* |
| A carriage runs 80–90 dB | The pet's speaker is for sounds that only need noticing; speech goes to earphones. |

## 5. Dead ends in the process

- **Designing before interpreting.** Our first idea document listed *formal preferences*
  ("portable, wearable, clip, Gameboy-sized, auditory") before any tension had been named; nothing
  traced back to an observation. We rebuilt from the observations.
- **Framing the commute as a problem to fix.** The first problem areas were security, speed,
  productivity and fun. Three are optimisation frames the brief explicitly rejects ("we don't want
  you to redesign Mumbai's commute") and the fourth is a tone, not a territory. Moving from
  **deficits to fix** to **territories to reveal** is what unstuck the concept.
- **Chasing validation.** After nine confirming conversations we kept planning more. Switching from
  discovery to **falsification** (name the assumptions that would change the project if wrong, then
  test those) would have used the same hours better.

## 6. If we did the research again

1. Run probes and counts in week one, before interviews.
2. Write down the assumptions that would kill the concept, and test those first.
3. Compare notes across the team early, and go looking for contradictions.
4. Keep a **graveyard** of parked ideas with the reason next to each: it's the clearest evidence that
   the final direction was chosen rather than stumbled into.
