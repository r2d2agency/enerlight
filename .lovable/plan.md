## Objetivo

Criar uma tela onde qualquer usuário registra a saída/uso de um veículo da empresa (visita a cliente, entrega, deslocamento), com KM inicial/final, data/hora, checklist rápido de vistoria e, opcionalmente, marca que houve entrega — nesse caso já gera automaticamente um registro na Logística usando as configurações da frota própria (preço por litro, km/l) para calcular o custo do frete.

## Fluxo do usuário

1. Menu **Logística → Veículos** (ou item novo "Controle de Veículos").
2. Página lista todas as saídas registradas, com filtros por veículo, motorista, período e status (aberta / finalizada).
3. Botão **"Registrar saída"**:
   - Veículo (dropdown de veículos cadastrados)
   - Motorista (auto = usuário logado, editável por admin)
   - Data/hora de saída (default = agora)
   - KM inicial
   - Checklist rápido: pneus, óleo, combustível, luzes, limpeza, avarias (checkboxes + campo "observações")
   - Destino / cliente visitado (autocomplete de empresas do CRM ou texto livre)
   - Motivo: Visita comercial / Entrega / Outro
   - Se **Entrega**: seleciona negociação (deal) da CRM e produtos/nota; ao salvar, cria automaticamente um `logistics_shipment` vinculado.
4. Botão **"Finalizar saída"** na linha aberta:
   - Data/hora de retorno
   - KM final (calcula distância = final - inicial)
   - Observações finais / avarias no retorno
   - Se marcado como entrega, atualiza `distance_km` e `own_fleet_cost` no shipment vinculado usando `logistics_fleet_settings`.

## Estrutura técnica

### Backend

**Nova migration `schema-vehicles.sql`:**

```text
vehicles
  id, organization_id, name (ex: "Fiorino ABC-1234"),
  plate, model, brand, year,
  current_km (cache do último km final),
  is_active, notes, created_at

vehicle_trips
  id, organization_id, vehicle_id, driver_id (user),
  departure_at, return_at (nullable),
  km_start, km_end (nullable), km_total (generated),
  purpose ('visit' | 'delivery' | 'other'),
  destination_text, client_company_id (nullable FK crm_companies),
  deal_id (nullable FK crm_deals),
  shipment_id (nullable FK logistics_shipments),
  checklist_out jsonb, checklist_in jsonb,
  notes_out, notes_in,
  status ('open' | 'closed'),
  created_at, updated_at

GRANTs padrão + índices em (organization_id, status, vehicle_id, driver_id)
```

**Novo `backend/src/routes/vehicles.js`:**
- `GET/POST/PUT/DELETE /api/vehicles` — CRUD de veículos
- `GET /api/vehicles/trips` (filtros)
- `POST /api/vehicles/trips` — cria saída; se `purpose = delivery`, cria shipment em `logistics_shipments` com carrier = nome da frota própria configurada
- `POST /api/vehicles/trips/:id/close` — fecha viagem, atualiza `current_km` do veículo e, se houver shipment vinculado, atualiza `distance_km` + `own_fleet_cost` reaproveitando `computeOwnFleetCost` já existente em `routes/logistics.js` (exportar helper)
- `GET /api/vehicles/trips/:id`
- Registrar em `backend/src/index.js`

### Frontend

- `src/hooks/use-vehicles.ts` — hooks React Query para veículos e viagens
- `src/pages/ControleVeiculos.tsx` — página principal com tabs "Viagens" e "Veículos"
- `src/components/vehicles/VehicleFormDialog.tsx` — cadastro de veículo
- `src/components/vehicles/TripFormDialog.tsx` — registrar saída (com checklist + seleção condicional de entrega)
- `src/components/vehicles/TripCloseDialog.tsx` — finalizar saída (km final + checklist retorno)
- Rota nova em `src/App.tsx`: `/controle-veiculos`
- Item de menu na `Sidebar` sob "Logística"

### Integração com Logística

- Reaproveita `logistics_fleet_settings` (preço/litro e km/litro já cadastrados) para calcular o custo.
- Shipment criado a partir de uma entrega já nasce com carrier = frota própria, `deal_id`, `client_name` e, ao fechar viagem, ganha `distance_km` e `own_fleet_cost`.
- Na tela de Logística o shipment aparece normalmente e soma no KPI da frota própria.

## Checklist padrão (JSON)

```text
{ tires: bool, oil: bool, fuel_level: '1/4'|'1/2'|'3/4'|'full',
  lights: bool, cleanliness: bool, damages: bool, damages_notes: string }
```

## Fora de escopo (podemos adicionar depois)

- Aprovação/assinatura digital da vistoria
- Upload de fotos do veículo antes/depois
- Relatórios de consumo por veículo / motorista
- Reserva/agenda de veículo

Confirmo e sigo com a implementação?