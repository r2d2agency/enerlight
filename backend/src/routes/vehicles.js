import { Router } from 'express';
import { query } from '../db.js';
import { authenticate as requireAuth } from '../middleware/auth.js';
import { getFleetSettings, computeOwnFleetCost } from './logistics.js';

const router = Router();

// Auto-migration for existing installs
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        name VARCHAR(150) NOT NULL,
        plate VARCHAR(20),
        brand VARCHAR(80),
        model VARCHAR(120),
        year INTEGER,
        current_km NUMERIC(12,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS vehicle_trips (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        vehicle_id UUID NOT NULL,
        driver_id UUID,
        departure_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        return_at TIMESTAMP WITH TIME ZONE,
        km_start NUMERIC(12,2) NOT NULL DEFAULT 0,
        km_end NUMERIC(12,2),
        purpose VARCHAR(30) NOT NULL DEFAULT 'visit',
        destination_text TEXT,
        client_company_id UUID,
        deal_id UUID,
        shipment_id UUID,
        checklist_out JSONB DEFAULT '{}'::jsonb,
        checklist_in JSONB DEFAULT '{}'::jsonb,
        notes_out TEXT,
        notes_in TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_vehicles_org ON vehicles(organization_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_trips_org ON vehicle_trips(organization_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_trips_status ON vehicle_trips(organization_id, status)`);
  } catch (e) {
    console.error('[vehicles] migration failed:', e.message);
  }
})();

async function getUserOrg(userId) {
  const r = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

// ===================== VEHICLES CRUD =====================
router.get('/', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const r = await query(
      `SELECT * FROM vehicles WHERE organization_id = $1 ORDER BY is_active DESC, name ASC`,
      [org.organization_id]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { name, plate, brand, model, year, current_km, notes, is_active } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const r = await query(
      `INSERT INTO vehicles (organization_id, name, plate, brand, model, year, current_km, notes, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [org.organization_id, name, plate || null, brand || null, model || null, year || null,
       parseFloat(current_km) || 0, notes || null, is_active !== false]
    );
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { name, plate, brand, model, year, current_km, notes, is_active } = req.body;
    const r = await query(
      `UPDATE vehicles SET name=$1, plate=$2, brand=$3, model=$4, year=$5, current_km=$6, notes=$7, is_active=$8, updated_at=NOW()
       WHERE id=$9 AND organization_id=$10 RETURNING *`,
      [name, plate || null, brand || null, model || null, year || null,
       parseFloat(current_km) || 0, notes || null, is_active !== false, req.params.id, org.organization_id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    await query(`DELETE FROM vehicles WHERE id=$1 AND organization_id=$2`, [req.params.id, org.organization_id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== TRIPS =====================
router.get('/trips', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { status, vehicle_id, driver_id, start_date, end_date } = req.query;
    const params = [org.organization_id];
    const where = ['t.organization_id = $1'];
    if (status) { params.push(status); where.push(`t.status = $${params.length}`); }
    if (vehicle_id) { params.push(vehicle_id); where.push(`t.vehicle_id = $${params.length}`); }
    if (driver_id) { params.push(driver_id); where.push(`t.driver_id = $${params.length}`); }
    if (start_date) { params.push(start_date); where.push(`t.departure_at >= $${params.length}`); }
    if (end_date) { params.push(end_date); where.push(`t.departure_at <= $${params.length}`); }
    const r = await query(
      `SELECT t.*, v.name AS vehicle_name, v.plate AS vehicle_plate,
              u.name AS driver_name,
              s.client_name AS shipment_client, s.carrier AS shipment_carrier, s.own_fleet_cost
       FROM vehicle_trips t
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN users u ON u.id = t.driver_id
       LEFT JOIN logistics_shipments s ON s.id = t.shipment_id
       WHERE ${where.join(' AND ')}
       ORDER BY t.departure_at DESC
       LIMIT 500`,
      params
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/trips/:id', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const r = await query(
      `SELECT t.*, v.name AS vehicle_name, v.plate AS vehicle_plate, u.name AS driver_name
       FROM vehicle_trips t
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN users u ON u.id = t.driver_id
       WHERE t.id=$1 AND t.organization_id=$2`,
      [req.params.id, org.organization_id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create trip (saída)
router.post('/trips', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const {
      vehicle_id, driver_id, departure_at, km_start,
      purpose, destination_text, client_company_id, deal_id,
      checklist_out, notes_out,
      // delivery-specific
      delivery_client_name, delivery_order_number, delivery_invoice_number
    } = req.body;

    if (!vehicle_id) return res.status(400).json({ error: 'Veículo obrigatório' });

    let shipment_id = null;
    if (purpose === 'delivery') {
      const settings = await getFleetSettings(org.organization_id);
      const ownCarrier = settings.own_carrier_name || 'Enerlight';
      const s = await query(
        `INSERT INTO logistics_shipments (
           organization_id, client_name, order_number, invoice_number,
           carrier, departure_date, deal_id, status, created_by, notes
         ) VALUES ($1,$2,$3,$4,$5, CURRENT_DATE, $6, 'Em rota', $7, $8)
         RETURNING id`,
        [
          org.organization_id,
          delivery_client_name || destination_text || 'Entrega interna',
          delivery_order_number || null,
          delivery_invoice_number || null,
          ownCarrier,
          deal_id || null,
          req.userId,
          'Gerado automaticamente pelo Controle de Veículos'
        ]
      );
      shipment_id = s.rows[0].id;
    }

    const r = await query(
      `INSERT INTO vehicle_trips (
         organization_id, vehicle_id, driver_id, departure_at, km_start,
         purpose, destination_text, client_company_id, deal_id, shipment_id,
         checklist_out, notes_out, status
       ) VALUES ($1,$2,$3,COALESCE($4::timestamptz, NOW()),$5,$6,$7,$8,$9,$10,$11,$12,'open')
       RETURNING *`,
      [
        org.organization_id, vehicle_id, driver_id || req.userId,
        departure_at || null, parseFloat(km_start) || 0,
        purpose || 'visit', destination_text || null,
        client_company_id || null, deal_id || null, shipment_id,
        checklist_out || {}, notes_out || null
      ]
    );
    res.json(r.rows[0]);
  } catch (e) {
    console.error('Create trip error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Close trip (retorno)
router.post('/trips/:id/close', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { return_at, km_end, checklist_in, notes_in } = req.body;

    const trip = await query(
      `SELECT * FROM vehicle_trips WHERE id=$1 AND organization_id=$2`,
      [req.params.id, org.organization_id]
    );
    if (!trip.rows[0]) return res.status(404).json({ error: 'Não encontrado' });

    const kmEndNum = parseFloat(km_end) || 0;
    const kmStartNum = parseFloat(trip.rows[0].km_start) || 0;
    const distance = Math.max(0, kmEndNum - kmStartNum);

    const r = await query(
      `UPDATE vehicle_trips SET
         return_at = COALESCE($1::timestamptz, NOW()),
         km_end = $2,
         checklist_in = $3,
         notes_in = $4,
         status = 'closed',
         updated_at = NOW()
       WHERE id=$5 AND organization_id=$6 RETURNING *`,
      [return_at || null, kmEndNum, checklist_in || {}, notes_in || null,
       req.params.id, org.organization_id]
    );

    // Update vehicle current km
    await query(
      `UPDATE vehicles SET current_km = GREATEST(current_km, $1), updated_at=NOW() WHERE id=$2 AND organization_id=$3`,
      [kmEndNum, trip.rows[0].vehicle_id, org.organization_id]
    );

    // If shipment linked → update distance + own_fleet_cost
    if (trip.rows[0].shipment_id) {
      const settings = await getFleetSettings(org.organization_id);
      const cost = computeOwnFleetCost(distance, settings);
      await query(
        `UPDATE logistics_shipments SET
           distance_km = $1,
           own_fleet_cost = $2,
           actual_delivery = CURRENT_DATE,
           status = 'Entregue',
           updated_at = NOW()
         WHERE id = $3 AND organization_id = $4`,
        [distance, cost, trip.rows[0].shipment_id, org.organization_id]
      );
    }

    res.json(r.rows[0]);
  } catch (e) {
    console.error('Close trip error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/trips/:id', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    await query(`DELETE FROM vehicle_trips WHERE id=$1 AND organization_id=$2`, [req.params.id, org.organization_id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
