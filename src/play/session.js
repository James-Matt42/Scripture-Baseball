// Session calculations are deliberately independent of React, so the same
// rules can later be used for progress reports and persisted sessions.
export function getPracticeStats(attempts, totalPitches, exactVerse = false) {
  const bookCorrect = attempts.filter((attempt) => attempt.bookCorrect).length;
  const chapterCorrect = attempts.filter((attempt) => attempt.chapterCorrect).length;
  const verseCorrect = exactVerse
    ? attempts.filter((attempt) => attempt.verseCorrect).length
    : 0;

  return {
    completed: attempts.length,
    totalPitches,
    bookCorrect,
    chapterCorrect,
    verseCorrect,
    earnedPoints: bookCorrect + chapterCorrect + verseCorrect,
    possiblePoints: totalPitches * (exactVerse ? 3 : 2),
  };
}

// When a session is paused after answering but before clicking Next Pitch,
// continuing should not repeat a pitch that has already earned points.
export function getResumePitchIndex(questions, pitchIndex, attempts) {
  const current = questions[pitchIndex];
  if (current && attempts.some((attempt) => attempt.questionId === current.id)) {
    return Math.min(pitchIndex + 1, questions.length - 1);
  }
  return pitchIndex;
}
