/**
 * Format a date string to local timezone
 * @param dateString - ISO date string from backend
 * @returns Formatted time string (e.g., "05:23 PM" or "Yesterday 05:23 PM" or "Jan 15, 2024 05:23 PM")
 */
export function formatMessageTime(dateString?: string): string {
  if (!dateString) {
    return "Just now";
  }

  try {
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return "Just now";
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    // Format time (HH:MM AM/PM)
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    const timeString = `${displayHours}:${displayMinutes} ${ampm}`;

    // Check if message is from today
    if (messageDate.getTime() === today.getTime()) {
      return timeString;
    }

    // Check if message is from yesterday
    if (messageDate.getTime() === yesterday.getTime()) {
      return `Yesterday ${timeString}`;
    }

    // Check if message is from this year
    if (date.getFullYear() === now.getFullYear()) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[date.getMonth()]} ${date.getDate()}, ${timeString}`;
    }

    // Message is from a different year
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${timeString}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return "";
  }
}

