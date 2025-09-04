export const KEEPER = {
  minReadyPerCategory: 50,
  windowDaysPrimary: 3,
  windowDaysFallback: 7,
  maxNewSummariesPerCategory: 24, // lower to avoid bursts
  parallel: 1, // SERIALIZE calls to start (you can try 2 later)
};
