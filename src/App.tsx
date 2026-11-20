import { BrowserRouter, HashRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nProvider } from "@/i18n/I18nProvider";
import { AuthProvider } from "@/components/feature/AuthProvider";
import WhatsAppButton from "@/components/feature/WhatsAppButton";
import { ContentProvider } from "@/cms/ContentProvider";
import { AnnouncementBar, PreviewBadge } from "@/cms/SiteChrome";


// نشر تجريبي على استضافة لا تخدم المسارات العميقة (مثل معاينة Artifacts): التوجيه بالوسم # بدل المسار
const Router = import.meta.env.VITE_ROUTER === "hash" ? HashRouter : BrowserRouter;

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <ContentProvider>
            <Router basename={import.meta.env.VITE_ROUTER === "hash" ? undefined : __BASE_PATH__}>
              <AppRoutes />
              <WhatsAppButton />
              <AnnouncementBar />
              <PreviewBadge />
            </Router>
        </ContentProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
