/**
 * Generates a repayment schedule based on loan start date, frequency, and amount.
 * @param startDate ISO date string
 * @param frequency 'daily' | 'weekly' | 'monthly'
 * @param totalAmount Total loan amount (Principal + Interest)
 * @param installmentAmount Fixed installment amount
 * @returns Array of date strings
 */
export const generateRepaymentSchedule = (
  startDate: string,
  frequency: 'daily' | 'weekly' | 'monthly',
  totalAmount: number,
  installmentAmount: number
): string[] => {
  if (!startDate || !installmentAmount || installmentAmount <= 0) return [];

  const dates: string[] = [];
  const start = new Date(startDate);
  const tenureUnits = Math.ceil(totalAmount / installmentAmount);

  for (let i = 0; i < tenureUnits; i++) {
    const d = new Date(start);
    if (frequency === 'daily') {
      d.setDate(start.getDate() + i);
    } else if (frequency === 'weekly') {
      d.setDate(start.getDate() + i * 7);
    } else if (frequency === 'monthly') {
      d.setMonth(start.getMonth() + i);
    }
    dates.push(d.toISOString().split('T')[0]);
  }

  return dates;
};

/**
 * Finds the index of the next due installment based on current date and schedule.
 */
export const findNextDueIndex = (schedule: string[], paidCount: number): number => {
  const today = new Date().toISOString().split('T')[0];
  // Simplest logic: the next due is the first unpaid item in the sequence
  return paidCount < schedule.length ? paidCount : -1;
};

/**
 * Formats a location link into a reliable Google Maps URL.
 */
export const getGoogleMapsUrl = (location: string): string => {
  if (!location) return "";
  if (location.startsWith('http')) return location;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
};
