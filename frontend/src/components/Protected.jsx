import { useAuth } from '../context/AuthContext';
import { can } from '../utils/permissions';

/* Route-level permission gate — the sidebar only hides a menu link, it
   never stopped someone who lands on the URL directly (bookmark, browser
   history, a stray link elsewhere) from loading the page and its data.
   This actually blocks rendering when the logged-in user lacks 'view' on
   the given permission module. */
export default function Protected({ module, children }) {
  const { user } = useAuth();
  if (can(user, module, 'view')) return children;
  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      height:'100%', minHeight:360, gap:10, fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      color:'#6B7280', textAlign:'center', padding:20,
    }}>
      <div style={{ fontSize:40 }}>🔒</div>
      <div style={{ fontSize:16, fontWeight:700, color:'#374151' }}>Access Restricted</div>
      <div style={{ fontSize:13, maxWidth:360 }}>
        You don't have permission to view this page. Contact your administrator if you believe this is a mistake.
      </div>
    </div>
  );
}
