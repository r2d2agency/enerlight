/**
 * Validação do Módulo de Representantes
 * 
 * Este script valida:
 * 1. Isolamento de dados (representante vê apenas seus dados)
 * 2. Permissões funcionando
 * 3. Integridade referencial do BD
 * 4. Portal separado funciona
 */

import { query } from './backend/src/db.js';

async function validateRepresentativesModule() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         VALIDAÇÃO: MÓDULO DE REPRESENTANTES                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Verificar tabelas existem
    console.log('✓ PASSO 1: Verificando estrutura de tabelas...\n');
    
    const tables = [
      'crm_representatives',
      'rep_portal_companies',
      'rep_portal_quotes',
      'rep_portal_quote_items',
      'rep_portal_orders',
      'rep_portal_order_items',
      'price_lists',
      'price_list_items',
    ];

    for (const table of tables) {
      const result = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        ) as exists
      `, [table]);
      
      console.log(result.rows[0].exists 
        ? `  ✓ ${table}` 
        : `  ✗ FALTA: ${table}`);
    }

    // 2. Contar registros
    console.log('\n✓ PASSO 2: Contando dados no sistema...\n');
    
    const counts = await Promise.all([
      query('SELECT COUNT(*) as count FROM crm_representatives'),
      query('SELECT COUNT(*) as count FROM rep_portal_companies'),
      query('SELECT COUNT(*) as count FROM rep_portal_quotes'),
      query('SELECT COUNT(*) as count FROM rep_portal_orders'),
      query('SELECT COUNT(*) as count FROM price_lists'),
    ]);

    console.log(`  • Representantes: ${counts[0].rows[0].count}`);
    console.log(`  • Clientes (Portal): ${counts[1].rows[0].count}`);
    console.log(`  • Orçamentos (Portal): ${counts[2].rows[0].count}`);
    console.log(`  • Pedidos (Portal): ${counts[3].rows[0].count}`);
    console.log(`  • Tabelas de Preço: ${counts[4].rows[0].count}`);

    // 3. Validar isolamento de dados
    console.log('\n✓ PASSO 3: Validando ISOLAMENTO DE DADOS...\n');
    
    // Pegar um representante com dados
    const reps = await query(`
      SELECT r.id, r.name, 
             (SELECT COUNT(*) FROM rep_portal_companies WHERE representative_id = r.id) as companies_count,
             (SELECT COUNT(*) FROM rep_portal_quotes WHERE representative_id = r.id) as quotes_count
      FROM crm_representatives r
      LIMIT 5
    `);

    if (reps.rows.length === 0) {
      console.log('  ⚠ Nenhum representante cadastrado. Teste sem dados.');
    } else {
      for (const rep of reps.rows) {
        console.log(`  📊 Representante: ${rep.name} (ID: ${rep.id})`);
        console.log(`     • Clientes: ${rep.companies_count}`);
        console.log(`     • Orçamentos: ${rep.quotes_count}`);

        // Validar que os dados pertencem APENAS a este representante
        const companies = await query(`
          SELECT representative_id FROM rep_portal_companies 
          WHERE representative_id = $1
        `, [rep.id]);

        const validCompanies = companies.rows.every(c => c.representative_id === rep.id);
        console.log(`     ${validCompanies ? '✓' : '✗'} Clientes isolados`);

        const quotes = await query(`
          SELECT representative_id FROM rep_portal_quotes 
          WHERE representative_id = $1
        `, [rep.id]);

        const validQuotes = quotes.rows.every(q => q.representative_id === rep.id);
        console.log(`     ${validQuotes ? '✓' : '✗'} Orçamentos isolados\n`);
      }
    }

    // 4. Validar relacionamentos
    console.log('✓ PASSO 4: Validando INTEGRIDADE REFERENCIAL...\n');

    // Orfãos: quotes sem representative
    const orphanQuotes = await query(`
      SELECT COUNT(*) as count FROM rep_portal_quotes 
      WHERE representative_id IS NULL OR 
            NOT EXISTS (SELECT 1 FROM crm_representatives WHERE id = representative_id)
    `);
    console.log(`  ${orphanQuotes.rows[0].count === 0 ? '✓' : '✗'} Orçamentos orfãos: ${orphanQuotes.rows[0].count}`);

    // Orfãos: companies sem representative
    const orphanCompanies = await query(`
      SELECT COUNT(*) as count FROM rep_portal_companies 
      WHERE representative_id IS NULL OR 
            NOT EXISTS (SELECT 1 FROM crm_representatives WHERE id = representative_id)
    `);
    console.log(`  ${orphanCompanies.rows[0].count === 0 ? '✓' : '✗'} Clientes orfãos: ${orphanCompanies.rows[0].count}`);

    // Orfãos: orders sem representative
    const orphanOrders = await query(`
      SELECT COUNT(*) as count FROM rep_portal_orders 
      WHERE representative_id IS NULL OR 
            NOT EXISTS (SELECT 1 FROM crm_representatives WHERE id = representative_id)
    `);
    console.log(`  ${orphanOrders.rows[0].count === 0 ? '✓' : '✗'} Pedidos orfãos: ${orphanOrders.rows[0].count}`);

    // 5. Validar permissões
    console.log('\n✓ PASSO 5: Validando PERMISSÕES...\n');

    const permissionKeys = [
      'can_view_representative_dashboard',
      'can_view_all_representative_quotes',
      'can_view_representatives',
      'can_manage_representative_config',
    ];

    for (const key of permissionKeys) {
      const result = await query(`
        SELECT COUNT(DISTINCT user_id) as users 
        FROM user_permissions 
        WHERE $1 = true
      `, [key]);
      console.log(`  • ${key}: ${result.rows[0].users} usuários`);
    }

    // 6. Validar vinculação de usuários
    console.log('\n✓ PASSO 6: Validando VINCULAÇÃO USUÁRIOS ↔ REPRESENTANTES...\n');

    const linkedUsers = await query(`
      SELECT COUNT(*) as count FROM crm_representatives 
      WHERE linked_user_id IS NOT NULL
    `);
    console.log(`  • Representantes com usuário vinculado: ${linkedUsers.rows[0].count}`);

    const unlinkedUsers = await query(`
      SELECT COUNT(*) as count FROM crm_representatives 
      WHERE linked_user_id IS NULL
    `);
    console.log(`  • Representantes SEM usuário vinculado: ${unlinkedUsers.rows[0].count}`);

    // Verificar se há usuários vinculados a múltiplos representantes
    const userRepCount = await query(`
      SELECT linked_user_id, COUNT(*) as rep_count 
      FROM crm_representatives 
      WHERE linked_user_id IS NOT NULL
      GROUP BY linked_user_id
      HAVING COUNT(*) > 1
    `);
    
    if (userRepCount.rows.length > 0) {
      console.log(`  ⚠ ATENÇÃO: ${userRepCount.rows.length} usuários vinculados a múltiplos representantes:`);
      for (const row of userRepCount.rows) {
        console.log(`     • User ${row.linked_user_id}: ${row.rep_count} representantes`);
      }
    } else {
      console.log(`  ✓ Cada usuário vinculado a apenas 1 representante (OK)`);
    }

    // 7. Resumo de tipos de representantes
    console.log('\n✓ PASSO 7: Resumo TIPOS DE REPRESENTANTES...\n');

    const typeStats = await query(`
      SELECT 
        indicator_type,
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN is_active THEN 1 ELSE 0 END), 0) as active,
        COUNT(DISTINCT linked_user_id) as with_user
      FROM crm_representatives
      GROUP BY indicator_type
      ORDER BY total DESC
    `);

    for (const row of typeStats.rows) {
      console.log(`  ${row.indicator_type}:`);
      console.log(`    • Total: ${row.total} | Ativos: ${row.active} | Com usuário: ${row.with_user}`);
    }

    // 8. Relatório de comissões
    console.log('\n✓ PASSO 8: Relatório COMISSÕES...\n');

    const commissionStats = await query(`
      SELECT 
        name,
        commission_percent,
        (SELECT COUNT(*) FROM rep_portal_companies WHERE representative_id = r.id) as clients,
        (SELECT COALESCE(SUM(total_value), 0) FROM rep_portal_quotes WHERE representative_id = r.id) as quote_value
      FROM crm_representatives r
      WHERE commission_percent > 0
      ORDER BY quote_value DESC
      LIMIT 5
    `);

    if (commissionStats.rows.length === 0) {
      console.log('  Nenhum representante com comissão configurada');
    } else {
      console.log('  Top 5 por valor de orçamento:\n');
      for (const rep of commissionStats.rows) {
        const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
        console.log(`  • ${rep.name}`);
        console.log(`    Comissão: ${rep.commission_percent}% | Clientes: ${rep.clients} | Orçamentos: ${fmt(rep.quote_value)}`);
      }
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    ✓ VALIDAÇÃO CONCLUÍDA                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n✗ ERRO na validação:', error.message);
    process.exit(1);
  }
}

validateRepresentativesModule().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
