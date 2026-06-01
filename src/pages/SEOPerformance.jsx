import { useClients } from '../hooks/useClients';
import SEODashboard from '../components/SEODashboard';
import AddClientModal from '../components/Modals/AddClientModal';
import { useState } from 'react';

export default function SEOPerformance() {
  const { clients, addClient } = useClients();
  const [showAddClient, setShowAddClient] = useState(false);

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <SEODashboard
          clients={clients}
          onAddClient={() => setShowAddClient(true)}
        />
      </div>
      <AddClientModal
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        onAdd={addClient}
      />
    </div>
  );
}
