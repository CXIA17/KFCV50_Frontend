/**
 * Data processing utilities for the visualizer
 */

/**
 * Calculate project statistics
 */
export const calculateStatistics = (projectData, focusedNode = null) => {
  if (!projectData || !projectData.nodes || !projectData.links) {
    return {
      totalModules: 0,
      totalDependencies: 0,
      circularDeps: 0,
      maxDepth: 0,
      avgDeps: 0
    };
  }

  const totalModules = projectData.nodes.length;
  const totalDependencies = projectData.links.length;
  
  // Detect circular dependencies
  const circularPairs = detectCircularDependencies(projectData);
  const circularDeps = circularPairs.length;
  
  // Calculate max dependency depth
  const depthMap = new Map();
  const calculateDepth = (nodeId, visited = new Set()) => {
    if (visited.has(nodeId)) return 0; // Avoid infinite loops
    if (depthMap.has(nodeId)) return depthMap.get(nodeId);
    
    visited.add(nodeId);
    const dependencies = projectData.links.filter(link => link.source === nodeId || link.source?.id === nodeId);
    
    let maxChildDepth = 0;
    dependencies.forEach(dep => {
      const targetId = dep.target?.id || dep.target;
      if (targetId !== nodeId) {
        const childDepth = calculateDepth(targetId, new Set(visited));
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      }
    });
    
    const depth = maxChildDepth + 1;
    depthMap.set(nodeId, depth);
    return depth;
  };

  let maxDepth = 0;
  projectData.nodes.forEach(node => {
    const depth = calculateDepth(node.id);
    maxDepth = Math.max(maxDepth, depth);
  });

  // Calculate average dependencies per node
  const avgDeps = totalModules > 0 ? (totalDependencies / totalModules).toFixed(1) : 0;

  return {
    totalModules,
    totalDependencies,
    circularDeps,
    maxDepth,
    avgDeps: parseFloat(avgDeps)
  };
};

/**
 * Detect circular dependencies in the project
 */
export const detectCircularDependencies = (projectData) => {
  if (!projectData || !projectData.links) return [];
  
  const circularPairs = [];
  const visited = new Set();
  const recursionStack = new Set();
  
  const dfs = (nodeId, path = []) => {
    if (recursionStack.has(nodeId)) {
      // Found a cycle, extract the circular portion
      const cycleStart = path.indexOf(nodeId);
      if (cycleStart !== -1) {
        const cycle = path.slice(cycleStart);
        cycle.push(nodeId); // Complete the cycle
        
        // Add pairs from the cycle
        for (let i = 0; i < cycle.length - 1; i++) {
          const pair = [cycle[i], cycle[i + 1]];
          const reverseCheck = circularPairs.find(p => 
            (p[0] === pair[1] && p[1] === pair[0]) || 
            (p[0] === pair[0] && p[1] === pair[1])
          );
          if (!reverseCheck) {
            circularPairs.push(pair);
          }
        }
      }
      return;
    }
    
    if (visited.has(nodeId)) return;
    
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);
    
    // Find all outgoing edges
    const outgoingEdges = projectData.links.filter(link => {
      const sourceId = link.source?.id || link.source;
      return sourceId === nodeId;
    });
    
    outgoingEdges.forEach(link => {
      const targetId = link.target?.id || link.target;
      dfs(targetId, [...path]);
    });
    
    recursionStack.delete(nodeId);
    path.pop();
  };
  
  // Start DFS from each node
  projectData.nodes.forEach(node => {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  });
  
  return circularPairs;
};

/**
 * Detect various issues in the project structure
 */
export const detectIssues = (projectData, focusedNode = null) => {
  if (!projectData || !projectData.nodes || !projectData.links) return [];
  
  const issues = [];
  
  // Detect circular dependencies
  const circularDeps = detectCircularDependencies(projectData);
  if (circularDeps.length > 0) {
    issues.push({
      type: 'error',
      title: 'Circular Dependencies Detected',
      description: `Found ${circularDeps.length} circular dependency relationships that could cause injection failures.`
    });
  }
  
  // Detect nodes with too many dependencies
  const dependencyCounts = new Map();
  projectData.links.forEach(link => {
    const sourceId = link.source?.id || link.source;
    dependencyCounts.set(sourceId, (dependencyCounts.get(sourceId) || 0) + 1);
  });
  
  const highDependencyNodes = [];
  dependencyCounts.forEach((count, nodeId) => {
    if (count > 5) { // Threshold for too many dependencies
      highDependencyNodes.push(`${nodeId} (${count} deps)`);
    }
  });
  
  if (highDependencyNodes.length > 0) {
    issues.push({
      type: 'warning',
      title: 'High Dependency Count',
      description: `These nodes have many dependencies: ${highDependencyNodes.join(', ')}. Consider refactoring.`
    });
  }
  
  // Detect isolated nodes (no incoming or outgoing dependencies)
  const connectedNodes = new Set();
  projectData.links.forEach(link => {
    const sourceId = link.source?.id || link.source;
    const targetId = link.target?.id || link.target;
    connectedNodes.add(sourceId);
    connectedNodes.add(targetId);
  });
  
  const isolatedNodes = projectData.nodes.filter(node => !connectedNodes.has(node.id));
  if (isolatedNodes.length > 0) {
    issues.push({
      type: 'info',
      title: 'Isolated Components',
      description: `Found ${isolatedNodes.length} components with no dependencies: ${isolatedNodes.map(n => n.id).join(', ')}`
    });
  }
  
  return issues;
};

/**
 * Transform base classes data from API response
 */
export const transformBaseClasses = (baseClassesData) => {
  console.log('API Response:', baseClassesData);
  
  // Handle the actual API response structure
  let classArray = baseClassesData;
  let parentClass = "java.lang.Object"; // Default parent
  
  // If the data has a base_classes property, use that
  if (baseClassesData && baseClassesData.base_classes && Array.isArray(baseClassesData.base_classes)) {
    classArray = baseClassesData.base_classes;
    // Check if there's a parent_class specified in the response
    if (baseClassesData.parent_class) {
      parentClass = baseClassesData.parent_class;
    }
  }
  
  if (!classArray || !Array.isArray(classArray)) {
    console.warn('Invalid base classes data:', baseClassesData);
    return { nodes: [], links: [] };
  }

  const nodes = [];
  const links = [];
  const nodeSet = new Set();

  // Helper function to convert dot notation to slash notation
  const convertDotToSlash = (name) => {
    if (!name) return name;
    return name.replace(/\./g, '/');
  };

  // Add the parent class node (e.g., Object)
  const parentNodeName = convertDotToSlash(parentClass);
  // Always add the parent class node, including java.lang.Object if it will be referenced
  if (!nodeSet.has(parentNodeName)) {
    nodes.push({
      id: parentNodeName,
      type: "class",
      scope: "module", 
      isProvider: false,
      fullName: parentNodeName
    });
    nodeSet.add(parentNodeName);
  }

  // Process each base class
  classArray.forEach(classData => {
    if (!classData || !classData.name) {
      console.warn('Invalid class data:', classData);
      return;
    }

    const className = convertDotToSlash(classData.name);
    
    // Add the main class node if not already added
    if (!nodeSet.has(className)) {
      nodes.push({
        id: className,
        type: classData.is_provider ? "provider" : "class",
        scope: classData.scope || "module",
        isProvider: classData.is_provider || false,
        fullName: className,
        ...classData
      });
      nodeSet.add(className);
    }

    // Add inheritance relationship to parent class
    if (parentClass && parentClass !== className) {
      const targetParent = convertDotToSlash(parentClass);
      
      // Only add link if we don't already have it
      const existingLink = links.find(link => 
        link.source === className && link.target === targetParent && link.type === "extends"
      );
      
      if (!existingLink) {
        links.push({
          source: className,
          target: targetParent,
          type: "extends"
        });
      }
    }

    // Add parent class relationship if specified in individual class data
    if (classData.parent_class && classData.parent_class !== className && classData.parent_class !== parentClass) {
      const specificParent = convertDotToSlash(classData.parent_class);
      
      // Add parent node if not already added
      if (!nodeSet.has(specificParent)) {
        nodes.push({
          id: specificParent,
          type: "class",
          scope: "module",
          isProvider: false,
          fullName: specificParent
        });
        nodeSet.add(specificParent);
      }
      
      // Add inheritance link
      const existingSpecificLink = links.find(link => 
        link.source === className && link.target === specificParent && link.type === "extends"
      );
      
      if (!existingSpecificLink) {
        links.push({
          source: className,
          target: specificParent,
          type: "extends"
        });
      }
    }

    // Add provider relationships if specified
    if (classData.provider_class && classData.provider_class !== className) {
      const providerClass = convertDotToSlash(classData.provider_class);
      
      // Add provider node if not already added
      if (!nodeSet.has(providerClass)) {
        nodes.push({
          id: providerClass,
          type: "provider",
          scope: "module",
          isProvider: true,
          fullName: providerClass
        });
        nodeSet.add(providerClass);
      }
      
      // Add provider link
      const existingProviderLink = links.find(link => 
        link.source === providerClass && link.target === className && link.type === "provides"
      );
      
      if (!existingProviderLink) {
        links.push({
          source: providerClass,
          target: className,
          type: "provides"
        });
      }
    }

    // Process parameters (dependencies) if available
    if (classData.parameters && Array.isArray(classData.parameters)) {
      classData.parameters.forEach(param => {
        if (param && param.name && param.name !== className) {
          const paramName = convertDotToSlash(param.name);
          
          // Add parameter node if not already added
          if (!nodeSet.has(paramName)) {
            nodes.push({
              id: paramName,
              type: param.is_provider ? "provider" : "class",
              scope: "module",
              isProvider: param.is_provider || false,
              fullName: paramName
            });
            nodeSet.add(paramName);
          }
          
          // Add dependency link
          const existingDepLink = links.find(link => 
            link.source === className && link.target === paramName && link.type === "depends"
          );
          
          if (!existingDepLink) {
            links.push({
              source: className,
              target: paramName,
              type: "depends"
            });
          }
        }
      });
    }

    // Process components if available
    if (classData.components && Array.isArray(classData.components)) {
      classData.components.forEach(comp => {
        if (comp && comp.name && comp.name !== className) {
          const compName = convertDotToSlash(comp.name);
          
          // Add component node if not already added
          if (!nodeSet.has(compName)) {
            nodes.push({
              id: compName,
              type: comp.is_provider ? "provider" : "class",
              scope: "module",
              isProvider: comp.is_provider || false,
              fullName: compName
            });
            nodeSet.add(compName);
          }
          
          // Add component link
          const existingCompLink = links.find(link => 
            link.source === className && link.target === compName && link.type === "provides"
          );
          
          if (!existingCompLink) {
            links.push({
              source: className,
              target: compName,
              type: "provides"
            });
          }
        }
      });
    }

    // Process injections if available
    if (classData.injections && Array.isArray(classData.injections)) {
      classData.injections.forEach(inj => {
        if (inj && inj.name && inj.name !== className) {
          const injName = convertDotToSlash(inj.name);
          
          // Add injection node if not already added
          if (!nodeSet.has(injName)) {
            nodes.push({
              id: injName,
              type: inj.is_provider ? "provider" : "class",
              scope: "module",
              isProvider: inj.is_provider || false,
              fullName: injName
            });
            nodeSet.add(injName);
          }
          
          // Add injection link
          const existingInjLink = links.find(link => 
            link.source === className && link.target === injName && link.type === "injects"
          );
          
          if (!existingInjLink) {
            links.push({
              source: className,
              target: injName,
              type: "injects"
            });
          }
        }
      });
    }
  });

  // Validate that all links have corresponding nodes
  const nodeIds = new Set(nodes.map(node => node.id));
  const validLinks = links.filter(link => {
    const sourceExists = nodeIds.has(link.source);
    const targetExists = nodeIds.has(link.target);
    
    if (!sourceExists) {
      console.warn(`Link source node not found: ${link.source}`);
    }
    if (!targetExists) {
      console.warn(`Link target node not found: ${link.target}`);
    }
    
    return sourceExists && targetExists;
  });

  console.log(`Transformed ${classArray.length} base classes into ${nodes.length} nodes and ${validLinks.length} valid links`);
  console.log('Transformed data:', { nodes, links: validLinks }); // Debug log
  
  return { nodes, links: validLinks };
};

/**
 * Calculate node levels for hierarchical layout
 */
export const calculateNodeLevels = (projectData) => {
  if (!projectData || !projectData.nodes || !projectData.links) return {};
  
  const levels = {};
  const visited = new Set();
  const inProgress = new Set();
  
  const calculateLevel = (nodeId) => {
    if (levels[nodeId] !== undefined) return levels[nodeId];
    if (inProgress.has(nodeId)) return 0; // Break cycles
    
    inProgress.add(nodeId);
    
    // Find all nodes that this node depends on
    const dependencies = projectData.links.filter(link => {
      const sourceId = link.source?.id || link.source;
      return sourceId === nodeId;
    });
    
    let maxDependencyLevel = -1;
    dependencies.forEach(dep => {
      const targetId = dep.target?.id || dep.target;
      if (targetId !== nodeId) {
        const depLevel = calculateLevel(targetId);
        maxDependencyLevel = Math.max(maxDependencyLevel, depLevel);
      }
    });
    
    const level = maxDependencyLevel + 1;
    levels[nodeId] = level;
    inProgress.delete(nodeId);
    visited.add(nodeId);
    
    return level;
  };
  
  // Calculate levels for all nodes
  projectData.nodes.forEach(node => {
    if (!visited.has(node.id)) {
      calculateLevel(node.id);
    }
  });
  
  return levels;
};