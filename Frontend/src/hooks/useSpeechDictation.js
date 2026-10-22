import { useCallback, useEffect, useRef, useState } from "react";

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useSpeechDictation({
  enabled = true,
  lang = "en-US",
  onTranscript,
}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    setIsSupported(Boolean(getSpeechRecognition()));
  }, []);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setIsListening(false);
      return;
    }

    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {
      // Already stopped.
    }

    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const start = useCallback(
    (currentText = "") => {
      if (!enabled) return false;

      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) {
        window.alert(
          "Speech dictation is not supported in this browser. Try Chrome or Edge.",
        );
        return false;
      }

      stop();

      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      baseTextRef.current = currentText;
      recognitionRef.current = recognition;

      recognition.onresult = (event) => {
        let finalChunk = "";
        let interimChunk = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript || "";
          if (result.isFinal) {
            finalChunk += transcript;
          } else {
            interimChunk += transcript;
          }
        }

        if (finalChunk) {
          const prefix = baseTextRef.current.trim();
          baseTextRef.current = prefix
            ? `${prefix} ${finalChunk.trim()}`
            : finalChunk.trim();
        }

        const liveText = [baseTextRef.current, interimChunk.trim()]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        onTranscriptRef.current?.(liveText, {
          isFinal: Boolean(finalChunk) && !interimChunk,
        });
      };

      recognition.onerror = (event) => {
        if (event.error === "aborted" || event.error === "no-speech") {
          return;
        }
        console.error("Speech dictation error:", event.error);
        stop();
      };

      recognition.onend = () => {
        // If we still own this instance, listening ended.
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
          setIsListening(false);
        }
      };

      try {
        recognition.start();
        setIsListening(true);
        return true;
      } catch (error) {
        console.error(error);
        stop();
        return false;
      }
    },
    [enabled, lang, stop],
  );

  const toggle = useCallback(
    (currentText = "") => {
      if (isListening) {
        stop();
        return false;
      }
      return start(currentText);
    },
    [isListening, start, stop],
  );

  useEffect(() => () => stop(), [stop]);

  return {
    isListening,
    isSupported,
    start,
    stop,
    toggle,
  };
}
