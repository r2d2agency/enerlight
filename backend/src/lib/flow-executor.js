// Flow Executor - Processes visual flow nodes and sends messages
import { query } from '../db.js';
import * as whatsappProvider from './whatsapp-provider.js';

/**
 * Execute a flow starting from a given node
 */
export async function executeFlow(flowId, conversationId, startNodeId = 'start') {
  try {
    console.log(`Flow executor: Starting flow ${flowId} for conversation ${conversationId}`);
    
    // Get conversation and connection info
    const convResult = await query(
      `SELECT c.*, conn.api_url, conn.api_key, conn.instance_name, conn.instance_id, conn.wapi_token, conn.provider
       FROM conversations c
       JOIN connections conn ON conn.id = c.connection_id
       WHERE c.id = $1`,
      [conversationId]
    );

    if (convResult.rows.length === 0) {
      console.error('Flow executor: Conversation not found:', conversationId);
      return { success: false, error: 'Conversa não encontrada' };
    }

    const conversation = convResult.rows[0];
    const connection = {
      id: conversation.connection_id,
      api_url: conversation.api_url,
      api_key: conversation.api_key,
      instance_name: conversation.instance_name,
      instance_id: conversation.instance_id,
      wapi_token: conversation.wapi_token,
      provider: conversation.provider,
    };

    console.log(`Flow executor: Connection provider: ${connection.provider}, instance: ${connection.instance_name || connection.instance_id}`);

    // Get all nodes and edges for this flow
    const [nodesResult, edgesResult] = await Promise.all([
      query('SELECT * FROM flow_nodes WHERE flow_id = $1', [flowId]),
      query('SELECT * FROM flow_edges WHERE flow_id = $1', [flowId]),
    ]);

    const nodes = nodesResult.rows;
    const edges = edgesResult.rows;

    console.log(`Flow executor: Found ${nodes.length} nodes and ${edges.length} edges`);

    if (nodes.length === 0) {
      return { success: false, error: 'Fluxo sem nós configurados' };
    }

    // Create a map for easy node lookup
    const nodeMap = new Map();
    nodes.forEach(node => {
      nodeMap.set(node.node_id, node);
      console.log(`Flow executor: Node mapped: ${node.node_id} (${node.node_type})`);
    });

    // Create edge map (source_node_id -> edges)
    const edgeMap = new Map();
    edges.forEach(edge => {
      const key = edge.source_node_id;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, []);
      }
      edgeMap.get(key).push(edge);
    });

    // Initialize session variables
    const variables = {
      nome: conversation.contact_name || '',
      telefone: conversation.contact_phone || '',
    };

    // Find the start node and its first connected node
    let currentNodeId = startNodeId;
    
    // If starting from 'start', find the first connected node
    if (startNodeId === 'start') {
      const startEdges = edgeMap.get('start') || [];
      if (startEdges.length > 0) {
        currentNodeId = startEdges[0].target_node_id;
        console.log(`Flow executor: Start node found, moving to first connected node: ${currentNodeId}`);
      } else {
        console.log('Flow executor: No edges from start node');
        return { success: false, error: 'Nó inicial não conectado a outros nós' };
      }
    }

    let processedNodes = 0;
    const maxNodes = 50; // Safety limit

    while (currentNodeId && processedNodes < maxNodes) {
      const node = nodeMap.get(currentNodeId);
      
      if (!node) {
        console.log('Flow executor: Node not found:', currentNodeId);
        break;
      }

      processedNodes++;
      console.log(`Flow executor: Processing node ${node.node_id} (${node.node_type}) - content:`, JSON.stringify(node.content).substring(0, 200));

      // Process the node based on its type
      const result = await processNode(node, connection, conversation.contact_phone, variables);

      if (!result.success && result.error) {
        console.error('Flow executor: Node processing failed:', result.error);
      }

      // If node requires user input, stop here and wait
      if (result.waitForInput) {
        // Update session with current state
        await updateFlowSession(flowId, conversationId, currentNodeId, variables);
        return { success: true, waitingForInput: true, currentNode: currentNodeId };
      }

      // Get next node
      const outgoingEdges = edgeMap.get(currentNodeId) || [];
      
      if (outgoingEdges.length === 0) {
        // No more nodes - flow complete
        console.log('Flow executor: No more edges, flow complete');
        break;
      }

      // For now, follow the first edge (or handle specific routing based on node type)
      const nextEdge = result.nextHandle 
        ? outgoingEdges.find(e => e.source_handle === result.nextHandle) || outgoingEdges[0]
        : outgoingEdges[0];

      currentNodeId = nextEdge?.target_node_id;
      console.log(`Flow executor: Moving to next node: ${currentNodeId}`);
    }

    // Mark session as complete
    await completeFlowSession(conversationId);

    console.log(`Flow executor: Flow complete. Processed ${processedNodes} nodes`);
    return { success: true, nodesProcessed: processedNodes };
  } catch (error) {
    console.error('Flow executor error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process a single node
 */
async function processNode(node, connection, phone, variables) {
  const content = typeof node.content === 'string' 
    ? JSON.parse(node.content) 
    : (node.content || {});

  switch (node.node_type) {
    case 'start':
      // Start node - just continue to next
      return { success: true };

    case 'end':
      // End node - flow complete
      return { success: true };

    case 'message':
      return await processMessageNode(content, connection, phone, variables);

    case 'menu':
      // Menu requires user input
      await processMenuNode(content, connection, phone, variables);
      return { success: true, waitForInput: true };

    case 'input':
      // Input requires user input
      await processInputNode(content, connection, phone, variables);
      return { success: true, waitForInput: true };

    case 'delay':
      const delayMs = (content.delay_seconds || 1) * 1000;
      await sleep(delayMs);
      return { success: true };

    case 'condition':
      return processConditionNode(content, variables);

    case 'action':
      return await processActionNode(content, connection, phone, variables);

    default:
      console.log('Flow executor: Unknown node type:', node.node_type);
      return { success: true };
  }
}

/**
 * Process message node - send text/media
 */
async function processMessageNode(content, connection, phone, variables) {
  const mediaType = content.media_type || 'text';

  console.log(`Flow executor: processMessageNode - mediaType: ${mediaType}`, JSON.stringify(content).substring(0, 300));

  try {
    if (mediaType === 'gallery' && content.gallery_images?.length > 0) {
      // Send gallery images sequentially
      console.log(`Flow executor: Sending gallery with ${content.gallery_images.length} images`);
      for (let i = 0; i < content.gallery_images.length; i++) {
        const img = content.gallery_images[i];
        const caption = i === 0 && content.caption ? replaceVariables(content.caption, variables) : '';
        
        console.log(`Flow executor: Sending gallery image ${i + 1}: ${img.url?.substring(0, 50)}`);
        await whatsappProvider.sendMessage(connection, phone, caption, 'image', img.url);
        
        // Delay between images (1.5s)
        if (i < content.gallery_images.length - 1) {
          await sleep(1500);
        }
      }
    } else if (mediaType === 'image' && content.media_url) {
      const caption = content.caption ? replaceVariables(content.caption, variables) : '';
      console.log(`Flow executor: Sending image: ${content.media_url?.substring(0, 50)}`);
      await whatsappProvider.sendMessage(connection, phone, caption, 'image', content.media_url);
    } else if (mediaType === 'video' && content.media_url) {
      const caption = content.caption ? replaceVariables(content.caption, variables) : '';
      console.log(`Flow executor: Sending video: ${content.media_url?.substring(0, 50)}`);
      await whatsappProvider.sendMessage(connection, phone, caption, 'video', content.media_url);
    } else if (mediaType === 'audio' && content.media_url) {
      console.log(`Flow executor: Sending audio: ${content.media_url?.substring(0, 50)}`);
      await whatsappProvider.sendMessage(connection, phone, '', 'audio', content.media_url);
    } else if (content.message || content.text) {
      // Text message
      const text = replaceVariables(content.message || content.text, variables);
      console.log(`Flow executor: Sending text: ${text?.substring(0, 50)}`);
      await whatsappProvider.sendMessage(connection, phone, text, 'text');
    } else {
      console.log('Flow executor: processMessageNode - no content to send');
    }

    return { success: true };
  } catch (error) {
    console.error('Flow executor: Message node error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process menu node - send menu message
 */
async function processMenuNode(content, connection, phone, variables) {
  let menuText = content.prompt || content.message || 'Selecione uma opção:';
  menuText = replaceVariables(menuText, variables);

  // Build menu options text
  if (content.options?.length > 0) {
    menuText += '\n\n';
    content.options.forEach((opt, idx) => {
      menuText += `${idx + 1}. ${opt.label || opt.text}\n`;
    });
  }

  await whatsappProvider.sendMessage(connection, phone, menuText, 'text');
}

/**
 * Process input node - send prompt for user input
 */
async function processInputNode(content, connection, phone, variables) {
  let promptText = content.prompt || content.message || 'Digite sua resposta:';
  promptText = replaceVariables(promptText, variables);

  await whatsappProvider.sendMessage(connection, phone, promptText, 'text');
}

/**
 * Process condition node - evaluate and return next handle
 */
function processConditionNode(content, variables) {
  // Evaluate conditions and determine path
  const rules = content.rules || [];
  const operator = content.operator || 'AND';

  let result = operator === 'AND';

  for (const rule of rules) {
    const varValue = variables[rule.variable] || '';
    const ruleResult = evaluateRule(varValue, rule.operator, rule.value);

    if (operator === 'AND') {
      result = result && ruleResult;
    } else {
      result = result || ruleResult;
    }
  }

  return { 
    success: true, 
    nextHandle: result ? 'true' : 'false' 
  };
}

/**
 * Evaluate a single condition rule
 */
function evaluateRule(value, operator, compareValue) {
  const strValue = String(value || '').toLowerCase();
  const strCompare = String(compareValue || '').toLowerCase();

  switch (operator) {
    case 'equals':
    case 'equal':
      return strValue === strCompare;
    case 'not_equals':
    case 'not_equal':
      return strValue !== strCompare;
    case 'contains':
      return strValue.includes(strCompare);
    case 'not_contains':
      return !strValue.includes(strCompare);
    case 'starts_with':
      return strValue.startsWith(strCompare);
    case 'ends_with':
      return strValue.endsWith(strCompare);
    case 'is_empty':
      return strValue === '';
    case 'is_not_empty':
      return strValue !== '';
    case 'greater_than':
      return parseFloat(value) > parseFloat(compareValue);
    case 'less_than':
      return parseFloat(value) < parseFloat(compareValue);
    default:
      return false;
  }
}

/**
 * Process action node
 */
async function processActionNode(content, connection, phone, variables) {
  const actionType = content.action_type;

  try {
    switch (actionType) {
      case 'add_tag':
        // Tag logic would go here
        console.log('Flow action: Add tag', content.tag_id);
        break;
      case 'remove_tag':
        console.log('Flow action: Remove tag', content.tag_id);
        break;
      case 'close_conversation':
        console.log('Flow action: Close conversation');
        break;
      case 'external_notification':
        // Send message to external number
        if (content.external_phone && content.external_message) {
          const msg = replaceVariables(content.external_message, variables);
          const targetPhone = replaceVariables(content.external_phone, variables);
          await whatsappProvider.sendMessage(connection, targetPhone, msg, 'text');
        }
        break;
    }
    return { success: true };
  } catch (error) {
    console.error('Flow executor: Action node error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Replace variables in text
 */
function replaceVariables(text, variables) {
  if (!text) return text;
  
  // Replace {{var}} and {var} patterns
  return text
    .replace(/\{\{(\w+)\}\}/g, (match, varName) => variables[varName] || match)
    .replace(/\{(\w+)\}/g, (match, varName) => variables[varName] || match);
}

/**
 * Update flow session state
 */
async function updateFlowSession(flowId, conversationId, currentNodeId, variables) {
  try {
    await query(
      `UPDATE flow_sessions 
       SET current_node_id = $1, variables = $2, updated_at = NOW()
       WHERE conversation_id = $3 AND flow_id = $4 AND is_active = true`,
      [currentNodeId, JSON.stringify(variables), conversationId, flowId]
    );
  } catch (error) {
    console.log('Flow session update skipped:', error.message);
  }
}

/**
 * Mark flow session as complete
 */
async function completeFlowSession(conversationId) {
  try {
    await query(
      `UPDATE flow_sessions 
       SET is_active = false, ended_at = NOW()
       WHERE conversation_id = $1 AND is_active = true`,
      [conversationId]
    );
  } catch (error) {
    console.log('Flow session complete skipped:', error.message);
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
