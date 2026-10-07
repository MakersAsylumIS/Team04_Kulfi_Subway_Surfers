Story WAVs for the pet's SD card go here (copy them to /stories on the card):
16-bit PCM, mono, 22050 Hz, named <story id>.wav.
ffmpeg -i in.mp3 -ac 1 -ar 22050 -c:a pcm_s16le <story id>.wav
The recordings are not in the public repository.
