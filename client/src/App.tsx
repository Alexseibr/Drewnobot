import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { AppLayout } from "@/components/layout/app-layout";

import LandingPage from "@/pages/landing";
import BathBookingPage from "@/pages/guest/bath-booking";
import QuadBookingPage from "@/pages/guest/quad-booking";
import SpaBookingPage from "@/pages/guest/spa-booking";
import OpsDashboard from "@/pages/ops/dashboard";
import BookingsPage from "@/pages/ops/bookings";
import NewBookingPage from "@/pages/ops/new-booking";
import CashPage from "@/pages/ops/cash";
import TasksPage from "@/pages/ops/tasks";
import WorkLogsPage from "@/pages/ops/worklogs";
import LaundryPage from "@/pages/ops/laundry";
import GuestsPage from "@/pages/ops/guests";
import SuppliesPage from "@/pages/ops/supplies";
import IncidentsPage from "@/pages/ops/incidents";
import InstructorSchedulePage from "@/pages/instructor/schedule";
import InstructorManagePage from "@/pages/instructor/manage";
import InstructorFinancesPage from "@/pages/instructor/finances";
import InstructorPricingPage from "@/pages/instructor/pricing";
import InstructorMaintenancePage from "@/pages/instructor/maintenance";
import OwnerAnalyticsPage from "@/pages/owner/analytics";
import OwnerCashPage from "@/pages/owner/cash";
import OwnerSettingsPage from "@/pages/owner/settings";
import OwnerStaffPage from "@/pages/owner/staff";
import TextileAuditPage from "@/pages/owner/textile-audit";
import ShiftsPage from "@/pages/owner/shifts";
import UnitInfoPage from "@/pages/owner/unit-info";
import ThermostatsPage from "@/pages/owner/thermostats";
import UtilitiesPage from "@/pages/owner/utilities";
import CompletedTasksPage from "@/pages/owner/completed-tasks";
import NotificationsPage from "@/pages/owner/notifications";
import StaffManagementPage from "@/pages/admin/staff";
import ClaimRolePage from "@/pages/claim-role";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      
      <Route path="/guest/bath" component={BathBookingPage} />
      <Route path="/guest/quads" component={QuadBookingPage} />
      <Route path="/guest/spa" component={SpaBookingPage} />
            
      <Route path="/ops" component={OpsDashboard} />
      <Route path="/ops/bookings" component={BookingsPage} />
      <Route path="/ops/bookings/new" component={NewBookingPage} />
      <Route path="/ops/cash" component={CashPage} />
      <Route path="/ops/tasks" component={TasksPage} />
      <Route path="/ops/worklogs" component={WorkLogsPage} />
      <Route path="/ops/laundry" component={LaundryPage} />
      <Route path="/ops/guests" component={GuestsPage} />
      <Route path="/ops/supplies" component={SuppliesPage} />
      <Route path="/ops/incidents" component={IncidentsPage} />
      
      <Route path="/instructor" component={InstructorSchedulePage} />
      <Route path="/instructor/sessions" component={InstructorSchedulePage} />
      <Route path="/instructor/manage" component={InstructorManagePage} />
      <Route path="/instructor/finances" component={InstructorFinancesPage} />
      <Route path="/instructor/pricing" component={InstructorPricingPage} />
      <Route path="/instructor/maintenance" component={InstructorMaintenancePage} />
      
      <Route path="/owner/analytics" component={OwnerAnalyticsPage} />
      <Route path="/owner/cash" component={OwnerCashPage} />
      <Route path="/owner/settings" component={OwnerSettingsPage} />
      <Route path="/owner/staff" component={OwnerStaffPage} />
      <Route path="/owner/textile-audit" component={TextileAuditPage} />
      <Route path="/owner/shifts" component={ShiftsPage} />
      <Route path="/owner/unit-info" component={UnitInfoPage} />
      <Route path="/owner/thermostats" component={ThermostatsPage} />
      <Route path="/owner/utilities" component={UtilitiesPage} />
      <Route path="/owner/completed-tasks" component={CompletedTasksPage} />
      <Route path="/owner/notifications" component={NotificationsPage} />
      
      <Route path="/admin/staff" component={StaffManagementPage} />
      
      <Route path="/staff-login" component={ClaimRolePage} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="drewno-theme">
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AppLayout>
              <Router />
            </AppLayout>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
