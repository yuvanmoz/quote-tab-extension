chrome.runtime.onMessage.addListener((message) => {
  if (message.target === 'offscreen' && message.type === 'play_sound') {
    const audio = new Audio(message.file);
    audio.volume = message.volume || 1.0;
    audio.play()
      .then(() => {
        console.log("Audio played successfully: " + message.file);
      })
      .catch((err) => {
        console.error("Audio playback failed:", err);
      });
  }
});
