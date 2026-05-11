/**
 * Side-effect import: registers all calendar, email, ATS, and HRIS providers.
 * Import this once in route handlers / actions that use provider abstractions.
 */

// Calendar
import "./google-calendar";
import "./outlook-calendar";

// Email
import "./google-email";
import "./outlook-email";

// ATS
import "./greenhouse";
import "./lever";
import "./ashby";
import "./workable";

// HRIS
import "./bamboohr";
import "./workday";
import "./gusto";
