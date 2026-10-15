"use client";

import { useState, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";

import { EventCalendar, type CalendarEvent } from "./";
import { calendarEventsApi } from "@/lib/api";

export default function EventCalendarApp() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Fetch events from API
  const fetchEvents = useCallback(async (startDate?: Date, endDate?: Date) => {
    try {
      setLoading(true);
      const start = startDate || startOfMonth(currentDate);
      const end = endDate || endOfMonth(currentDate);
      
      const fetchedEvents = await calendarEventsApi.getCalendarEvents(
        undefined,
        format(start, "yyyy-MM-dd"),
        format(end, "yyyy-MM-dd")
      );
      
      // Convert date strings to Date objects
      const mappedEvents = fetchedEvents.map((event: any) => ({
        ...event,
        start: new Date(event.start),
        end: new Date(event.end),
      }));
      
      setEvents(mappedEvents);
    } catch (error: any) {
      console.error("Failed to fetch calendar events:", error);
      toast.error("Failed to load calendar events");
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  // Initial load and when date changes
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Check for upcoming events and create notifications in the database
  useEffect(() => {
    const checkAndCreateNotifications = async () => {
      try {
        // Call the backend endpoint to check for upcoming events and create notifications
        const data = await calendarEventsApi.checkAndCreateNotifications();
        if (data.notificationsCreated > 0) {
          console.log(`Created ${data.notificationsCreated} calendar event notifications`);
        }
      } catch (error) {
        console.error("Failed to check and create event notifications:", error);
      }
    };

    // Check immediately
    checkAndCreateNotifications();

    // Check every minute to catch events as they approach
    const interval = setInterval(checkAndCreateNotifications, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleEventAdd = async (event: CalendarEvent) => {
    try {
      const newEvent = await calendarEventsApi.createCalendarEvent({
        title: event.title,
        description: event.description,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        color: event.color,
        location: event.location,
      });
      
      // Convert date strings to Date objects
      const mappedEvent = {
        ...newEvent,
        start: new Date(newEvent.start),
        end: new Date(newEvent.end),
      };
      
      setEvents([...events, mappedEvent]);
      toast.success("Event created successfully");
    } catch (error: any) {
      console.error("Failed to create event:", error);
      toast.error("Failed to create event");
    }
  };

  const handleEventUpdate = async (updatedEvent: CalendarEvent) => {
    try {
      const updated = await calendarEventsApi.updateCalendarEvent(updatedEvent.id, {
        title: updatedEvent.title,
        description: updatedEvent.description,
        start: updatedEvent.start,
        end: updatedEvent.end,
        allDay: updatedEvent.allDay,
        color: updatedEvent.color,
        location: updatedEvent.location,
      });
      
      // Convert date strings to Date objects
      const mappedEvent = {
        ...updated,
        start: new Date(updated.start),
        end: new Date(updated.end),
      };
      
      setEvents(events.map((event) => (event.id === updatedEvent.id ? mappedEvent : event)));
      toast.success("Event updated successfully");
    } catch (error: any) {
      console.error("Failed to update event:", error);
      toast.error("Failed to update event");
    }
  };

  const handleEventDelete = async (eventId: string) => {
    try {
      await calendarEventsApi.deleteCalendarEvent(eventId);
      setEvents(events.filter((event) => event.id !== eventId));
      toast.success("Event deleted successfully");
    } catch (error: any) {
      console.error("Failed to delete event:", error);
      toast.error("Failed to delete event");
    }
  };

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading calendar events...</div>
      </div>
    );
  }

  return (
    <EventCalendar
      events={events}
      onEventAdd={handleEventAdd}
      onEventUpdate={handleEventUpdate}
      onEventDelete={handleEventDelete}
    />
  );
}
