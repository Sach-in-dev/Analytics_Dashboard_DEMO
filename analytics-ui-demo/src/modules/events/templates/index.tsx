import type { FC } from "react";
import EventsPage from "../section/events";

interface EventsTemplateProps {}

const EventsTemplate: FC<EventsTemplateProps> = ({}) => {
  return (
    <>
      <EventsPage />
    </>
  );
};
export default EventsTemplate;
