import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

const Visualizer = () => {
  const svgRef = useRef();
  const tooltipRef = useRef();
  const [projectData, setProjectData] = useState({
    nodes: [
      { id: "AppModule", type: "module", scope: "singleton" },
      { id: "NetworkModule", type: "module", scope: "singleton" },
      { id: "DatabaseModule", type: "module", scope: "singleton" },
      { id: "AuthService", type: "service", scope: "singleton" },
      { id: "UserRepository", type: "repository", scope: "singleton" },
      { id: "ApiClient", type: "service", scope: "singleton" },
      { id: "CacheManager", type: "service", scope: "singleton" },
      { id: "LoggingService", type: "service", scope: "singleton" },
      { id: "AnalyticsModule", type: "module", scope: "singleton" },
      { id: "EventTracker", type: "service", scope: "singleton" },
      { id: "ConfigService", type: "service", scope: "singleton" },
      { id: "FeatureModule", type: "module", scope: "prototype" },
      { id: "PaymentService", type: "service", scope: "singleton" },
      { id: "NotificationService", type: "service", scope: "singleton" }
    ],
    links: [
      { source: "AppModule", target: "NetworkModule", type: "provides" },
      { source: "AppModule", target: "DatabaseModule", type: "provides" },
      { source: "AppModule", target: "AnalyticsModule", type: "provides" },
      { source: "NetworkModule", target: "ApiClient", type: "provides" },
      { source: "NetworkModule", target: "ConfigService", type: "inject" },
      { source: "DatabaseModule", target: "UserRepository", type: "provides" },
      { source: "DatabaseModule", target: "CacheManager", type: "provides" },
      { source: "AuthService", target: "UserRepository", type: "inject" },
      { source: "AuthService", target: "ApiClient", type: "inject" },
      { source: "UserRepository", target: "CacheManager", type: "inject" },
      { source: "ApiClient", target: "LoggingService", type: "inject" },
      { source: "LoggingService", target: "ConfigService", type: "inject" },
      { source: "AnalyticsModule", target: "EventTracker", type: "provides" },
      { source: "EventTracker", target: "ApiClient", type: "inject" },
      { source: "FeatureModule", target: "PaymentService", type: "provides" },
      { source: "PaymentService", target: "ApiClient", type: "inject" },
      { source: "NotificationService", target: "EventTracker", type: "inject" },
      { source: "NotificationService", target: "UserRepository", type: "inject" },
      { source: "ConfigService", target: "LoggingService", type: "inject" }
    ]
  });
  
  const [currentLayout, setCurrentLayout] = useState('force');
  const [searchTerm, setSearchTerm] = useState('');
  const [statistics, setStatistics] = useState({
    totalModules: 0,
    totalDependencies: 0,
    circularDeps: 0,
    maxDepth: 0,
    avgDeps: 0
  });
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [classInfo, setClassInfo] = useState(null);
  const [loadingClassInfo, setLoadingClassInfo] = useState(false);
  const [exploredNodes, setExploredNodes] = useState(new Set());
  const [isExploring, setIsExploring] = useState(false);
  const [previousState, setPreviousState] = useState(null);
  const [focusedNode, setFocusedNode] = useState(null);
  const [loadingFocus, setLoadingFocus] = useState(false);
  
  const simulationRef = useRef();

  // Utility function to convert dot notation to slash notation
  const convertDotToSlash = (name) => {
    if (!name) return name;
    return name.replace(/\./g, '/');
  };

  const focusOnNode = async (nodeId) => {
    setLoadingFocus(true);
    
    try {
      // Save current state for back functionality
      setPreviousState({
        nodes: [...projectData.nodes],
        links: [...projectData.links],
        focusedNode: focusedNode
      });

      // Find all nodes connected to the selected node
      const connectedNodeIds = new Set([nodeId]);
      const relevantLinks = [];

      // Find all direct connections
      projectData.links.forEach(link => {
        const sourceId = link.source?.id || link.source;
        const targetId = link.target?.id || link.target;

        if (sourceId === nodeId) {
          connectedNodeIds.add(targetId);
          relevantLinks.push(link);
        }
        if (targetId === nodeId) {
          connectedNodeIds.add(sourceId);
          relevantLinks.push(link);
        }
      });

      // Only include nodes that are actually connected to the selected node
      const focusedNodes = projectData.nodes.filter(node => 
        connectedNodeIds.has(node.id)
      );

      // Filter out self-referencing provider links
      const filteredLinks = relevantLinks.filter(link => {
        const sourceId = link.source?.id || link.source;
        const targetId = link.target?.id || link.target;
        
        // Remove links where source and target are the same (self-referencing)
        if (sourceId === targetId) {
          console.log(`Filtering out self-referencing link: ${sourceId} -> ${targetId}`);
          return false;
        }
        
        return true;
      });

      // Clear previous data and set new focused data
      setProjectData({
        nodes: focusedNodes,
        links: filteredLinks
      });

      setFocusedNode(nodeId);
      
      // Reset view after focusing
      setTimeout(() => {
        resetView();
      }, 100);
      
    } finally {
      setLoadingFocus(false);
    }
  };

  const goBack = () => {
    if (previousState) {
      // Simply restore the previous nodes and links
      setProjectData({
        nodes: previousState.nodes,
        links: previousState.links
      });
      setFocusedNode(previousState.focusedNode);
      setPreviousState(null);
      
      // Reset view after state change
      setTimeout(() => {
        resetView();
      }, 100);
    }
  };

  const resetView = () => {
    // Reset zoom and center the view
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      const container = svgRef.current.parentElement;
      const width = container.clientWidth;
      const height = container.clientHeight;

      // Get bounds of all nodes
      if (projectData.nodes.length > 0) {
        const bounds = {
          minX: Math.min(...projectData.nodes.map(d => d.x || 0)),
          maxX: Math.max(...projectData.nodes.map(d => d.x || 0)),
          minY: Math.min(...projectData.nodes.map(d => d.y || 0)),
          maxY: Math.max(...projectData.nodes.map(d => d.y || 0))
        };

        const graphWidth = bounds.maxX - bounds.minX;
        const graphHeight = bounds.maxY - bounds.minY;

        // Add padding and set initial scale to zoomed out
        const padding = 50;
        // Zoom out more: scale down to fit graph in 60% of view
        const scale = Math.min(
          0.6 * (width - padding * 2) / (graphWidth || width),
          0.6 * (height - padding * 2) / (graphHeight || height),
          0.6 // Don't scale up beyond 0.6x (more zoomed out)
        );

        const centerX = bounds.minX + graphWidth / 2;
        const centerY = bounds.minY + graphHeight / 2;

        const translateX = width / 2 - centerX * scale;
        const translateY = height / 2 - centerY * scale;

        svg.transition()
          .duration(750)
          .call(
            d3.zoom().transform,
            d3.zoomIdentity.translate(translateX, translateY).scale(scale)
          );
      } else {
        // Fallback to zoomed out center
        svg.transition()
          .duration(750)
          .call(
            d3.zoom().transform,
            d3.zoomIdentity.translate(0, 0).scale(0.2)
          );
      }
    }
  };

  const getNodeColor = useCallback((node) => {
    const colors = {
      module: "#667eea",
      service: "#48dbfb",
      repository: "#00d2d3",
      singleton: "#feca57",
      provider: "#ff9ff3",
      class: "#95a5a6"
    };
    
    if (node.isProvider) {
      return colors.provider;
    }
    if (node.scope === "singleton" && node.type === "service") {
      return colors.singleton;
    }
    return colors[node.type] || colors.class;
  }, []);

  const detectCircularDependencies = useCallback(() => {
    const graph = {};
    projectData.nodes.forEach(node => {
      graph[node.id] = [];
    });
    
    projectData.links.forEach(link => {
      const source = link.source?.id || link.source;
      const target = link.target?.id || link.target;
      if (graph[source]) {
        graph[source].push(target);
      }
    });
    
    const circular = [];
    const visited = new Set();
    const recursionStack = new Set();
    
    function dfs(node, path = []) {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          for (let i = cycleStart; i < path.length; i++) {
            circular.push([path[i], i === path.length - 1 ? node : path[i + 1]]);
          }
        }
        return true;
      }
      
      if (visited.has(node)) return false;
      
      visited.add(node);
      recursionStack.add(node);
      
      for (const neighbor of graph[node] || []) {
        if (dfs(neighbor, [...path, node])) {
          return true;
        }
      }
      
      recursionStack.delete(node);
      return false;
    }
    
    Object.keys(graph).forEach(node => {
      if (!visited.has(node)) {
        dfs(node);
      }
    });
    
    return circular;
  }, [projectData]);

  const calculateNodeLevels = useCallback(() => {
    const levels = {};
    const visited = new Set();
    
    function dfs(nodeId, level) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      levels[nodeId] = Math.max(levels[nodeId] || 0, level);
      
      projectData.links
        .filter(link => link.source === nodeId || link.source?.id === nodeId)
        .forEach(link => {
          const targetId = link.target?.id || link.target;
          dfs(targetId, level + 1);
        });
    }
    
    projectData.nodes
      .filter(node => !projectData.links.some(link => 
        link.target === node.id || link.target?.id === node.id))
      .forEach(node => dfs(node.id, 0));
    
    return levels;
  }, [projectData]);

  const updateStatistics = useCallback(() => {
    // Filter out isolated nodes for statistics when not in focused view
    const connectedNodeIds = new Set();
    projectData.links.forEach(link => {
      const sourceId = link.source?.id || link.source;
      const targetId = link.target?.id || link.target;
      connectedNodeIds.add(sourceId);
      connectedNodeIds.add(targetId);
    });

    const visibleNodes = focusedNode ? 
      projectData.nodes : 
      projectData.nodes.filter(node => connectedNodeIds.has(node.id));

    const circularDeps = detectCircularDependencies();
    const depths = calculateNodeLevels();
    const maxDepth = Math.max(...Object.values(depths), 0);
    const avgDeps = projectData.links.length / visibleNodes.length;
    
    setStatistics({
      totalModules: visibleNodes.length,
      totalDependencies: projectData.links.length,
      circularDeps: circularDeps.length,
      maxDepth: maxDepth,
      avgDeps: parseFloat(avgDeps.toFixed(2))
    });
  }, [projectData, detectCircularDependencies, calculateNodeLevels, focusedNode]);

  const detectIssues = useCallback(() => {
    const detectedIssues = [];
    
    // Check for circular dependencies
    const circularDeps = detectCircularDependencies();
    if (circularDeps.length > 0) {
      const uniquePairs = new Set();
      circularDeps.forEach(pair => {
        const key = [pair[0], pair[1]].sort().join('-');
        uniquePairs.add(key);
      });
      
      uniquePairs.forEach(pair => {
        const [source, target] = pair.split('-');
        detectedIssues.push({
          type: 'error',
          title: 'Circular Dependency',
          description: `${source} and ${target} have a circular dependency`
        });
      });
    }
    
    // Check for god objects (too many dependencies)
    projectData.nodes.forEach(node => {
      const deps = projectData.links.filter(l => 
        l.source === node.id || l.source?.id === node.id
      ).length;
      
      if (deps > 5) {
        detectedIssues.push({
          type: 'warning',
          title: 'High Coupling',
          description: `${node.id} has ${deps} dependencies, consider refactoring`
        });
      }
    });
    
    // Only check for isolated modules when NOT in focused view
    if (!focusedNode) {
      projectData.nodes.forEach(node => {
        const isUsed = projectData.links.some(l => 
          l.target === node.id || l.target?.id === node.id
        );
        const hasOutputs = projectData.links.some(l => 
          l.source === node.id || l.source?.id === node.id
        );
        
        if (!isUsed && !hasOutputs && node.id !== 'AppModule') {
          detectedIssues.push({
            type: 'info',
            title: 'Isolated Component',
            description: `${node.id} appears to be isolated from the dependency graph`
          });
        }
      });
    }
    
    setIssues(detectedIssues);
  }, [projectData, detectCircularDependencies, focusedNode]);

  const renderGraph = useCallback(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const container = svgRef.current.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const g = svg.append("g");
    const tooltip = d3.select(tooltipRef.current);

    // Filter out isolated nodes (nodes with no connections)
    const connectedNodeIds = new Set();
    projectData.links.forEach(link => {
      const sourceId = link.source?.id || link.source;
      const targetId = link.target?.id || link.target;
      connectedNodeIds.add(sourceId);
      connectedNodeIds.add(targetId);
    });

    // Only show connected nodes unless in focused view (where we want to show the selected relationships)
    const visibleNodes = focusedNode ? 
      projectData.nodes : 
      projectData.nodes.filter(node => connectedNodeIds.has(node.id));

    console.log(`Showing ${visibleNodes.length} out of ${projectData.nodes.length} nodes`);

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Detect circular dependencies
    const circularPairs = detectCircularDependencies();

    // Filter out any links that reference non-existent nodes
    const nodeIds = new Set(projectData.nodes.map(n => n.id));
    const validLinks = projectData.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      
      const sourceExists = nodeIds.has(sourceId);
      const targetExists = nodeIds.has(targetId);
      
      if (!sourceExists || !targetExists) {
        console.warn('Filtering out invalid link:', { 
          source: sourceId, 
          target: targetId, 
          sourceExists, 
          targetExists 
        });
        return false;
      }
      return true;
    });

    console.log('Valid links after filtering:', validLinks.length, 'out of', projectData.links.length);

    // Create arrow markers with different colors for different relationship types
    svg.append("defs").selectAll("marker")
      .data(["normal", "circular", "extends", "depends", "provides", "injects"])
      .enter().append("marker")
      .attr("id", d => `arrow-${d}`)
      .attr("viewBox", "0 -6 12 12")
      .attr("refX", 28)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .attr("markerUnits", "strokeWidth")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5L2,0Z") // More pointed arrow shape
      .attr("fill", d => {
        switch(d) {
          case "circular": return "#ff6b6b";
          case "extends": return "#3b82f6"; // blue
          case "depends": return "#10b981"; // green
          case "provides": return "#8b5cf6"; // purple
          case "injects": return "#f59e0b"; // orange
          default: return "#999";
        }
      })
      .attr("stroke", "#fff") // White outline for better visibility
      .attr("stroke-width", 0.5);

    // Function to get link color based on type
    const getLinkColor = (link) => {
      const isCircular = circularPairs.some(pair => 
        (pair[0] === link.source && pair[1] === link.target) ||
        (pair[0] === link.target && pair[1] === link.source)
      );
      
      if (isCircular) return "#ff6b6b";
      
      switch(link.type) {
        case "extends": return "#3b82f6"; // blue
        case "depends": return "#10b981"; // green
        case "provides": return "#8b5cf6"; // purple
        case "injects": return "#f59e0b"; // orange
        default: return "#999";
      }
    };

    // Function to get marker type based on link
    const getMarkerType = (link) => {
      const isCircular = circularPairs.some(pair => 
        (pair[0] === link.source && pair[1] === link.target) ||
        (pair[0] === link.target && pair[1] === link.source)
      );
      
      if (isCircular) return "circular";
      return link.type || "normal";
    };

    // Create links
    const link = g.append("g")
      .selectAll("path")
      .data(validLinks)
      .enter().append("path")
      .attr("fill", "none")
      .attr("stroke", getLinkColor)
      .attr("stroke-width", 2.5) // Slightly thicker lines
      .attr("stroke-opacity", 0.8) // Higher opacity for better visibility
      .attr("marker-end", d => `url(#arrow-${getMarkerType(d)})`)
      .classed("circular", d => {
        return circularPairs.some(pair => 
          (pair[0] === d.source && pair[1] === d.target) ||
          (pair[0] === d.target && pair[1] === d.source)
        );
      })
      .on("mouseover", function(event, d) {
        // Highlight arrow on hover
        d3.select(this)
          .attr("stroke-width", 4)
          .attr("stroke-opacity", 1);
      })
      .on("mouseout", function(event, d) {
        // Reset arrow styling
        d3.select(this)
          .attr("stroke-width", 2.5)
          .attr("stroke-opacity", 0.8);
      });

    // Add relationship labels on links
    const linkLabels = g.append("g")
      .selectAll("text")
      .data(validLinks)
      .enter().append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("font-weight", "500")
      .attr("fill", "#555")
      .attr("pointer-events", "none")
      .style("user-select", "none")
      .text(d => d.type || "");

    // Create nodes
    const node = g.append("g")
      .selectAll("g")
      .data(visibleNodes)
      .enter().append("g")
      .attr("class", "node")
      .style("cursor", "pointer");

    // Add circles for nodes
    node.append("circle")
      .attr("r", d => d.type === "module" ? 15 : 12)
      .attr("fill", getNodeColor)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .on("mouseover", function(event, d) {
        // Highlight connected nodes and links
        const connectedNodes = new Set([d.id]);
        const connectedLinks = new Set();
        
        validLinks.forEach(link => {
          const sourceId = link.source?.id || link.source;
          const targetId = link.target?.id || link.target;
          
          if (sourceId === d.id) {
            connectedNodes.add(targetId);
            connectedLinks.add(link);
          }
          if (targetId === d.id) {
            connectedNodes.add(sourceId);
            connectedLinks.add(link);
          }
        });
        
        // Highlight connected nodes
        d3.selectAll(".node circle")
          .style("opacity", node => connectedNodes.has(node.id) ? 1 : 0.3)
          .style("stroke-width", node => connectedNodes.has(node.id) ? 3 : 2);
        
        // Highlight connected links
        d3.selectAll("path")
          .style("opacity", link => {
            const sourceId = link.source?.id || link.source;
            const targetId = link.target?.id || link.target;
            return (sourceId === d.id || targetId === d.id) ? 1 : 0.1;
          })
          .style("stroke-width", link => {
            const sourceId = link.source?.id || link.source;
            const targetId = link.target?.id || link.target;
            return (sourceId === d.id || targetId === d.id) ? 3 : 2;
          });

        // Show tooltip with dependency info
        const dependencies = validLinks
          .filter(link => link.source === d.id || link.source?.id === d.id)
          .map(link => link.target?.id || link.target);
        
        const dependents = validLinks
          .filter(link => link.target === d.id || link.target?.id === d.id)
          .map(link => link.source?.id || link.source);
        
        tooltip.html(`
          <div class="font-semibold">${d.id}</div>
          <div>Type: ${d.type}</div>
          <div>Scope: ${d.scope}</div>
          <div class="mt-2">
            <div class="text-green-300">Dependencies (${dependencies.length}):</div>
            <div class="text-xs">${dependencies.length > 0 ? dependencies.join(", ") : "None"}</div>
          </div>
          <div class="mt-1">
            <div class="text-blue-300">Dependents (${dependents.length}):</div>
            <div class="text-xs">${dependents.length > 0 ? dependents.join(", ") : "None"}</div>
          </div>
          <div class="mt-2 text-yellow-300 text-xs">Click for detailed info</div>
        `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 10) + "px")
        .style("opacity", 1);
      })
      .on("mouseout", function() {
        // Reset all visual effects
        d3.selectAll(".node circle")
          .style("opacity", 1)
          .style("stroke-width", 2);
        
        d3.selectAll("path")
          .style("opacity", 0.4)
          .style("stroke-width", 2);
        
        tooltip.style("opacity", 0);
      })
      .on("click", function(event, d) {
        // Async function to handle the click
        (async () => {
          try {
            // Set loading state for class info
            setLoadingClassInfo(true);
            setSelectedNode(d.id);
            
            // Focus on this node's relationships and fetch class info
            await focusOnNode(d.id);
            await fetchClassInfo(d.id);
            
            // Visual feedback for clicked node
            d3.selectAll(".node circle")
              .style("stroke", node => node.id === d.id ? "#ff6b6b" : "#fff")
              .style("stroke-width", node => node.id === d.id ? 4 : 2);
          } catch (error) {
            console.error('Error handling node click:', error);
          } finally {
            // Always clear loading state
            setLoadingClassInfo(false);
          }
        })();
      });

    // Add labels
    node.append("text")
      .attr("dy", 25)
      .attr("text-anchor", "middle")
      .text(d => d.id)
      .style("fill", "#333")
      .style("font-size", "12px")
      .style("font-weight", "500")
      .style("pointer-events", "none")
      .style("user-select", "none");

    const linkArc = (d) => {
      const sourceNode = projectData.nodes.find(n => n.id === (d.source?.id || d.source));
      const targetNode = projectData.nodes.find(n => n.id === (d.target?.id || d.target));
      
      if (!sourceNode || !targetNode) return "";
      
      const dx = targetNode.x - sourceNode.x;
      const dy = targetNode.y - sourceNode.y;
      const dr = Math.sqrt(dx * dx + dy * dy);
      
      return `M${sourceNode.x},${sourceNode.y}A${dr},${dr} 0 0,1 ${targetNode.x},${targetNode.y}`;
    };

    // Setup simulation based on layout
    if (currentLayout === 'force') {
      simulationRef.current = d3.forceSimulation(visibleNodes)
        .force("link", d3.forceLink(validLinks)
          .id(d => d.id)
          .distance(100))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(30));

      const drag = d3.drag()
        .on("start", (event, d) => {
          if (!event.active) simulationRef.current.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulationRef.current.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        });

      node.call(drag);

      simulationRef.current.on("tick", () => {
        link.attr("d", linkArc);
        
        // Position link labels at the midpoint of each link
        linkLabels.attr("x", d => {
          const sourceNode = visibleNodes.find(n => n.id === (d.source?.id || d.source));
          const targetNode = visibleNodes.find(n => n.id === (d.target?.id || d.target));
          if (sourceNode && targetNode) {
            return (sourceNode.x + targetNode.x) / 2;
          }
          return 0;
        })
        .attr("y", d => {
          const sourceNode = visibleNodes.find(n => n.id === (d.source?.id || d.source));
          const targetNode = visibleNodes.find(n => n.id === (d.target?.id || d.target));
          if (sourceNode && targetNode) {
            return (sourceNode.y + targetNode.y) / 2 - 5; // Offset slightly above the line
          }
          return 0;
        });
        
        node.attr("transform", d => `translate(${d.x},${d.y})`);
      });
    } else {
      // Apply static layouts
      if (currentLayout === 'circular') {
        const radius = Math.min(width, height) / 2 - 100;
        const angleStep = (2 * Math.PI) / visibleNodes.length;
        
        visibleNodes.forEach((node, i) => {
          node.x = width / 2 + radius * Math.cos(i * angleStep - Math.PI / 2);
          node.y = height / 2 + radius * Math.sin(i * angleStep - Math.PI / 2);
        });
      } else if (currentLayout === 'hierarchical') {
        const levels = calculateNodeLevels();
        const maxLevel = Math.max(...Object.values(levels));
        const levelHeight = height / (maxLevel + 2);
        const nodesPerLevel = {};
        
        visibleNodes.forEach(node => {
          const level = levels[node.id] || 0;
          if (!nodesPerLevel[level]) nodesPerLevel[level] = [];
          nodesPerLevel[level].push(node);
        });
        
        Object.entries(nodesPerLevel).forEach(([level, nodes]) => {
          const levelWidth = width / (nodes.length + 1);
          nodes.forEach((node, i) => {
            node.x = levelWidth * (i + 1);
            node.y = levelHeight * (parseInt(level) + 1);
          });
        });
      }
      
      node.attr("transform", d => `translate(${d.x},${d.y})`);
      link.attr("d", linkArc);
      
      // Position link labels for static layouts
      linkLabels.attr("x", d => {
        const sourceNode = visibleNodes.find(n => n.id === (d.source?.id || d.source));
        const targetNode = visibleNodes.find(n => n.id === (d.target?.id || d.target));
        if (sourceNode && targetNode) {
          return (sourceNode.x + targetNode.x) / 2;
        }
        return 0;
      })
      .attr("y", d => {
        const sourceNode = visibleNodes.find(n => n.id === (d.source?.id || d.source));
        const targetNode = visibleNodes.find(n => n.id === (d.target?.id || d.target));
        if (sourceNode && targetNode) {
          return (sourceNode.y + targetNode.y) / 2 - 5;
        }
        return 0;
      });
    }

    // Apply search filter
    if (searchTerm) {
      d3.selectAll("circle")
        .style("opacity", d => 
          d.id.toLowerCase().includes(searchTerm.toLowerCase()) ? 1 : 0.2
        );
      
      d3.selectAll("text")
        .style("opacity", d => 
          d.id.toLowerCase().includes(searchTerm.toLowerCase()) ? 1 : 0.2
        );
    }

  }, [projectData, currentLayout, searchTerm, detectCircularDependencies, calculateNodeLevels, getNodeColor, focusedNode]);

  const analyzeProject = async () => {
    setLoading(true);
    setError(null);
    
    // Reset focus state when loading new data
    setPreviousState(null);
    setFocusedNode(null);
    
    try {
      const response = await fetch('https://automatic-space-spoon-wp5pgpvv65vh9r96-8000.app.github.dev/base-classes');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      const transformedData = transformBaseClasses(data);

      setProjectData(transformedData);
      
      // Reset view after loading new data with longer delay for force simulation
      setTimeout(() => {
        resetView();
      }, 1000);
      
    } catch (err) {
      console.error('Error fetching base classes:', err);
      setError(`Failed to fetch data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const transformBaseClasses = (apiData) => {
    console.log('API Response:', apiData);
    let nodes = [];
    let links = [];

    // Iterate over each parent class key
    Object.keys(apiData).forEach(parent => {
      // Skip count keys
      if (parent.endsWith('_count') || parent === 'group_count') return;
      const children = apiData[parent];
      if (!Array.isArray(children)) return;

      // Add parent node
      if (parent !== 'null' && parent !== 'None') {
        nodes.push({
          id: convertDotToSlash(parent),
          type: "class",
          scope: "module",
          isProvider: false,
          fullName: convertDotToSlash(parent)
        });
      }

      // Add child nodes and links
      children.forEach(child => {
        nodes.push({
          id: convertDotToSlash(child.name),
          type: child.is_provider ? "provider" : "class",
          scope: "module",
          isProvider: child.is_provider,
          fullName: convertDotToSlash(child.name)
        });
        // Link from child to parent
        if (parent !== 'null' && parent !== 'None') {
          links.push({
            source: convertDotToSlash(child.name),
            target: convertDotToSlash(parent),
            type: "extends"
          });
        }
      });
    });

    console.log('Transformed data:', { nodes, links }); // Debug log
    return { nodes, links };
  };

  const fetchClassInfo = async (className) => {
    try {
      // Safety check for className
      if (!className || typeof className !== 'string') {
        console.warn('Invalid className provided to fetchClassInfo:', className);
        return;
      }
      
      setIsExploring(true);
      setClassInfo(null); // Clear previous class info
      await exploreClassRecursively(className, new Set(), new Map(), new Set());
    } catch (err) {
      console.error('Error exploring class hierarchy:', err);
      setError(`Failed to explore class hierarchy: ${err.message}`);
    } finally {
      setIsExploring(false);
    }
  };

  const exploreClassRecursively = async (className, visited, nodeMap, linkSet, depth = 0) => {
    // Safety check for undefined or null className
    if (!className || typeof className !== 'string') {
      console.warn('Invalid className provided to exploreClassRecursively:', className);
      return;
    }
    
    // Prevent infinite recursion and limit depth
    if (visited.has(className) || depth > 5) {
      return;
    }
    
    visited.add(className);
    console.log(`Exploring ${className} at depth ${depth}`);
    
    // Initialize with current project data on first call (depth 0)
    if (depth === 0) {
      // Add existing nodes to nodeMap
      projectData.nodes.forEach(node => {
        nodeMap.set(node.id, node);
      });
      
      // Add existing links to linkSet
      projectData.links.forEach(link => {
        const linkKey = `${link.source}|||${link.type}|||${link.target}`;
        linkSet.add(linkKey);
      });
    }
    
    try {
      // Fetch class info - convert dot notation to slash notation for API call
      const apiClassName = className.replace(/\./g, '/');
      const classResponse = await fetch(`https://automatic-space-spoon-wp5pgpvv65vh9r96-8000.app.github.dev/class-info/${encodeURIComponent(apiClassName)}`);
      if (!classResponse.ok) {
        console.warn(`Failed to fetch class info for ${className}`);
        return;
      }
      
      const classData = await classResponse.json();
      
      const currentNodeName = convertDotToSlash(classData.name);
      
      // Add current node
      if (!nodeMap.has(currentNodeName)) {
        nodeMap.set(currentNodeName, {
          id: currentNodeName,
          type: classData.is_provider ? "provider" : "class",
          scope: "module",
          isProvider: classData.is_provider,
          fullName: convertDotToSlash(classData.name),
          classData: classData
        });
      }
      
      // Add parent class relationship
      if (classData.parent_class && classData.parent_class !== "java.lang.Object") {
        const parentNodeName = convertDotToSlash(classData.parent_class);
        
        // Only add if parent is different from current node
        if (parentNodeName !== currentNodeName) {
          if (!nodeMap.has(parentNodeName)) {
            nodeMap.set(parentNodeName, {
              id: parentNodeName,
              type: "class",
              scope: "module",
              isProvider: false,
              fullName: convertDotToSlash(classData.parent_class)
            });
          }
          
          const linkKey = `${currentNodeName}|||extends|||${parentNodeName}`;
          if (!linkSet.has(linkKey)) {
            linkSet.add(linkKey);
          }
        }
      }
      
      // Process parameters (dependencies)
      if (classData.parameters && classData.parameters.length > 0) {
        for (const param of classData.parameters) {
          const paramNodeName = convertDotToSlash(param.name);
          
          // Only add if parameter is different from current node
          if (paramNodeName !== currentNodeName) {
            if (!nodeMap.has(paramNodeName)) {
              nodeMap.set(paramNodeName, {
                id: paramNodeName,
                type: param.is_provider ? "provider" : "class",
                scope: "module",
                isProvider: param.is_provider,
                fullName: convertDotToSlash(param.name)
              });
            }
            
            const linkKey = `${currentNodeName}|||depends|||${paramNodeName}`;
            if (!linkSet.has(linkKey)) {
              linkSet.add(linkKey);
            }
            
            // Recursively explore parameter (with safety check)
            if (param.name && typeof param.name === 'string') {
              await exploreClassRecursively(param.name, visited, nodeMap, linkSet, depth + 1);
            }
          }
        }
      }
      
      // Process components
      if (classData.components && classData.components.length > 0) {
        for (const component of classData.components) {
          const compNodeName = convertDotToSlash(component.name);
          
          // Only add if component is different from current node
          if (compNodeName !== currentNodeName) {
            if (!nodeMap.has(compNodeName)) {
              nodeMap.set(compNodeName, {
                id: compNodeName,
                type: component.is_provider ? "provider" : "class",
                scope: "module",
                isProvider: component.is_provider,
                fullName: convertDotToSlash(component.name)
              });
            }
            
            const linkKey = `${currentNodeName}|||provides|||${compNodeName}`;
            if (!linkSet.has(linkKey)) {
              linkSet.add(linkKey);
            }
            
            // Recursively explore component (with safety check)
            if (component.name && typeof component.name === 'string') {
              await exploreClassRecursively(component.name, visited, nodeMap, linkSet, depth + 1);
            }
          }
        }
      }
      
      // Process injections
      if (classData.injections && classData.injections.length > 0) {
        for (const injection of classData.injections) {
          const injNodeName = convertDotToSlash(injection.name);
          
          // Only add if injection is different from current node
          if (injNodeName !== currentNodeName) {
            if (!nodeMap.has(injNodeName)) {
              nodeMap.set(injNodeName, {
                id: injNodeName,
                type: injection.is_provider ? "provider" : "class",
                scope: "module",
                isProvider: injection.is_provider,
                fullName: convertDotToSlash(injection.name)
              });
            }
            
            const linkKey = `${currentNodeName}|||injects|||${injNodeName}`;
            if (!linkSet.has(linkKey)) {
              linkSet.add(linkKey);
            }
            
            // Recursively explore injection (with safety check)
            if (injection.name && typeof injection.name === 'string') {
              await exploreClassRecursively(injection.name, visited, nodeMap, linkSet, depth + 1);
            }
          }
        }
      }
      
      // Try to fetch child classes for additional relationships
      try {
        const apiChildClassName = className.replace(/\./g, '/');
        const childResponse = await fetch(`https://automatic-space-spoon-wp5pgpvv65vh9r96-8000.app.github.dev/child-classes/${encodeURIComponent(apiChildClassName)}`);
        if (childResponse.ok) {
          const childData = await childResponse.json();
          
          if (childData.child_classes && childData.child_classes.length > 0) {
            for (const child of childData.child_classes) {
              const childNodeName = convertDotToSlash(child.name);
              
              // Only add if child is different from current node
              if (childNodeName !== currentNodeName) {
                if (!nodeMap.has(childNodeName)) {
                  nodeMap.set(childNodeName, {
                    id: childNodeName,
                    type: child.is_provider ? "provider" : "class",
                    scope: "module",
                    isProvider: child.is_provider,
                    fullName: convertDotToSlash(child.name)
                  });
                }
                
                const linkKey = `${childNodeName}|||extends|||${currentNodeName}`;
                if (!linkSet.has(linkKey)) {
                  linkSet.add(linkKey);
                }
                
                // Recursively explore child (with increased depth to prevent too deep exploration)
                if (depth < 3 && child.name && typeof child.name === 'string') {
                  await exploreClassRecursively(child.name, visited, nodeMap, linkSet, depth + 1);
                }
              }
            }
          }
        }
      } catch (childErr) {
        console.warn(`Failed to fetch child classes for ${className}:`, childErr);
      }
      
      // Update the project data with accumulated nodes and links only on root call
      if (depth === 0) {
        const newNodes = Array.from(nodeMap.values());
        const newLinks = Array.from(linkSet).map(linkKey => {
          const [source, type, target] = linkKey.split('|||');
          return { source, target, type };
        });
        
        console.log('Final explored data:', { nodes: newNodes, links: newLinks });
        
        setProjectData({ nodes: newNodes, links: newLinks });
        setClassInfo(classData);
        setSelectedNode(convertDotToSlash(classData.name));
        setExploredNodes(visited);
      }
      
    } catch (err) {
      console.error(`Error processing ${className}:`, err);
    }
  };

  const exportGraph = () => {
    const graphData = {
      nodes: projectData.nodes,
      links: projectData.links.map(link => ({
        source: link.source?.id || link.source,
        target: link.target?.id || link.target,
        type: link.type
      })),
      metadata: {
        exportDate: new Date().toISOString(),
        totalNodes: projectData.nodes.length,
        totalLinks: projectData.links.length,
        circularDependencies: detectCircularDependencies().length
      }
    };
    
    const dataStr = JSON.stringify(graphData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'knit-dependencies.json');
    linkElement.click();
  };

  useEffect(() => {
    renderGraph();
    updateStatistics();
  }, [renderGraph, updateStatistics]);

  useEffect(() => {
    detectIssues();
  }, [detectIssues]);

  // Auto-load base classes on component mount
  useEffect(() => {
    analyzeProject();
  }, []); // Empty dependency array means this runs once on mount

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      renderGraph();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderGraph]);

  // Cleanup simulation on unmount
  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-700 flex flex-col">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur-md p-4 lg:p-6 shadow-lg flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
            K
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-semibold text-gray-800">Knit Dependency Visualizer</h1>
            {focusedNode && (
              <p className="text-sm text-gray-600 mt-1">
                Focused on: <span className="font-medium text-indigo-600">{focusedNode}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:gap-4 items-center">
          {previousState && (
            <button
              onClick={goBack}
              className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-3 lg:px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-2 text-sm"
            >
              ← Back to Full View
            </button>
          )}
          {focusedNode && !previousState && (
            <button
              onClick={() => {
                setFocusedNode(null);
                setSelectedNode(null);
                setClassInfo(null);
                setExploredNodes(new Set());
                // Reset visual selection
                d3.selectAll(".node circle")
                  .style("stroke", "#fff")
                  .style("stroke-width", 2);
                // Reset view
                setTimeout(() => {
                  resetView();
                }, 100);
              }}
              className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-3 lg:px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-2 text-sm"
            >
              Clear Focus
            </button>
          )}
          <select 
            value={currentLayout}
            onChange={(e) => setCurrentLayout(e.target.value)}
            className="px-3 lg:px-4 py-2 border-2 border-gray-200 rounded-lg bg-white cursor-pointer text-sm transition-colors focus:border-indigo-500 focus:outline-none"
          >
            <option value="force">Force Layout</option>
            <option value="circular">Circular Layout</option>
            <option value="hierarchical">Hierarchical Layout</option>
          </select>
          <button
            onClick={() => detectIssues()}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-3 lg:px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:-translate-y-0.5 text-sm"
          >
            Detect Issues
          </button>
          <button
            onClick={exportGraph}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-3 lg:px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:-translate-y-0.5 text-sm"
          >
            Export Graph
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-4 lg:mx-6 mb-4 lg:mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <span className="text-red-500">⚠️</span>
          <span className="text-sm lg:text-base">{error}</span>
          <button 
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row flex-1 gap-4 lg:gap-6 p-4 lg:p-6 max-w-full lg:max-w-7xl w-full mx-auto">
        {/* Sidebar */}
        <div className="w-full lg:w-80 xl:w-96 bg-white/95 backdrop-blur-md rounded-2xl p-4 lg:p-6 shadow-lg overflow-y-auto max-h-96 lg:max-h-full">
          
          {/* Statistics Card */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 mb-6">
            <h3 className="text-gray-800 text-lg font-semibold mb-4 flex items-center gap-2">
              📊 Project Statistics
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-200/50">
                <span className="text-gray-600 text-sm">Total Modules</span>
                <span className="font-semibold text-gray-800">{statistics.totalModules}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200/50">
                <span className="text-gray-600 text-sm">Dependencies</span>
                <span className="font-semibold text-gray-800">{statistics.totalDependencies}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200/50">
                <span className="text-gray-600 text-sm">Circular Dependencies</span>
                <span className="font-semibold text-red-500">{statistics.circularDeps}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200/50">
                <span className="text-gray-600 text-sm">Max Depth</span>
                <span className="font-semibold text-gray-800">{statistics.maxDepth}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600 text-sm">Avg. Dependencies</span>
                <span className="font-semibold text-gray-800">{statistics.avgDeps}</span>
              </div>
            </div>
          </div>

          {/* Issues Section - Only show when there are issues */}
          {issues.length > 0 && (
            <div>
              <h3 className="text-gray-800 text-lg font-semibold mb-4 flex items-center gap-2">
                ⚠️ Detected Issues
              </h3>
              <div className="space-y-3">
                {issues.map((issue, index) => (
                  <div
                    key={index}
                    className={`bg-white border-l-4 p-4 rounded-lg shadow-sm transition-transform hover:translate-x-1 ${
                      issue.type === 'error' 
                        ? 'border-red-400' 
                        : issue.type === 'warning' 
                        ? 'border-yellow-400' 
                        : 'border-blue-400'
                    }`}
                  >
                    <div className="font-semibold text-gray-800 text-sm mb-1">{issue.title}</div>
                    <div className="text-gray-600 text-xs leading-relaxed">{issue.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Class Details Section */}
          {selectedNode && (
            <div className="mt-6">
              <h3 className="text-gray-800 text-lg font-semibold mb-4 flex items-center gap-2">
                🔍 Class Details: {selectedNode}
              </h3>
              
              {loadingClassInfo ? (
                <div className="bg-white border-l-4 border-blue-400 p-4 rounded-lg shadow-sm">
                  <div className="font-semibold text-gray-800 text-sm mb-1">
                    {isExploring ? 'Exploring Dependencies...' : 'Loading...'}
                  </div>
                  <div className="text-gray-600 text-xs">
                    {isExploring ? 'Recursively fetching class hierarchy and relationships...' : 'Fetching detailed class information...'}
                  </div>
                </div>
              ) : classInfo ? (
                <div className="bg-white border-l-4 border-green-400 p-4 rounded-lg shadow-sm">
                  <div className="space-y-2">
                    <div className="font-semibold text-gray-800 text-sm">{convertDotToSlash(classInfo.name)}</div>
                    
                    <div className="text-gray-600 text-xs">
                      <div className="mb-2">
                        <span className="font-medium">Parent Class:</span> {convertDotToSlash(classInfo.parent_class)}
                      </div>
                      <div className="mb-2">
                        <span className="font-medium">Is Provider:</span> {classInfo.is_provider ? 'Yes' : 'No'}
                      </div>
                      {classInfo.provider_class && (
                        <div className="mb-2">
                          <span className="font-medium">Provider Class:</span> {convertDotToSlash(classInfo.provider_class)}
                        </div>
                      )}
                    </div>
                    
                    {classInfo.parameters && classInfo.parameters.length > 0 && (
                      <div>
                        <div className="font-medium text-gray-700 text-xs mt-3 mb-1">Parameters ({classInfo.parameters.length}):</div>
                        <div className="text-gray-600 text-xs space-y-1">
                          {classInfo.parameters.map((param, idx) => (
                            <div key={idx} className="bg-gray-50 px-2 py-1 rounded text-xs flex justify-between">
                              <span>{convertDotToSlash(param.name)}</span>
                              {param.is_provider && <span className="text-purple-600 font-medium">Provider</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {classInfo.components && classInfo.components.length > 0 && (
                      <div>
                        <div className="font-medium text-gray-700 text-xs mt-3 mb-1">Components ({classInfo.components.length}):</div>
                        <div className="text-gray-600 text-xs space-y-1">
                          {classInfo.components.map((comp, idx) => (
                            <div key={idx} className="bg-gray-50 px-2 py-1 rounded text-xs flex justify-between">
                              <span>{convertDotToSlash(comp.name)}</span>
                              {comp.is_provider && <span className="text-purple-600 font-medium">Provider</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {classInfo.injections && classInfo.injections.length > 0 && (
                      <div>
                        <div className="font-medium text-gray-700 text-xs mt-3 mb-1">Injections ({classInfo.injections.length}):</div>
                        <div className="text-gray-600 text-xs space-y-1">
                          {classInfo.injections.map((inj, idx) => (
                            <div key={idx} className="bg-gray-50 px-2 py-1 rounded text-xs flex justify-between">
                              <span>{convertDotToSlash(inj.name)}</span>
                              {inj.is_provider && <span className="text-purple-600 font-medium">Provider</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {exploredNodes.size > 1 && (
                      <div className="mt-3 p-2 bg-blue-50 rounded">
                        <div className="font-medium text-blue-700 text-xs">Exploration Summary:</div>
                        <div className="text-blue-600 text-xs">
                          Explored {exploredNodes.size} classes in the dependency tree
                        </div>
                      </div>
                    )}
                    
                    <button 
                      onClick={() => {
                        setSelectedNode(null);
                        setClassInfo(null);
                        setExploredNodes(new Set());
                        // Reset visual selection
                        d3.selectAll(".node circle")
                          .style("stroke", "#fff")
                          .style("stroke-width", 2);
                      }}
                      className="mt-3 text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded transition-colors"
                    >
                      Close Details
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white border-l-4 border-red-400 p-4 rounded-lg shadow-sm">
                  <div className="font-semibold text-gray-800 text-sm mb-1">Failed to load</div>
                  <div className="text-gray-600 text-xs">Could not fetch class information</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Visualization Container */}
        <div className="flex-1 min-h-96 lg:min-h-[600px] bg-white/95 backdrop-blur-md rounded-2xl shadow-lg relative overflow-hidden">
          <svg ref={svgRef} className="w-full h-full min-h-96 lg:min-h-[600px]"></svg>
          
          {/* Loading overlay for class info */}
          {loadingClassInfo && (
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-20">
              <div className="bg-white rounded-lg p-6 lg:p-8 shadow-xl flex flex-col items-center gap-4 max-w-sm mx-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <div className="text-center">
                  <div className="text-gray-800 font-semibold text-base lg:text-lg mb-1">
                    Analyzing Class: {selectedNode}
                  </div>
                  <div className="text-gray-600 text-sm">
                    {isExploring ? 'Exploring dependency hierarchy...' : 'Fetching class information and relationships...'}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Loading overlay for focusing */}
          {loadingFocus && (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-10">
              <div className="bg-white rounded-lg p-6 shadow-lg flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                <span className="text-gray-700 font-medium">Loading node details...</span>
              </div>
            </div>
          )}
          
          {/* Tooltip */}
          <div 
            ref={tooltipRef}
            className="absolute text-left p-3 text-sm bg-black/85 text-white rounded-lg pointer-events-none opacity-0 transition-opacity max-w-64 shadow-lg"
          ></div>
          
          {/* Legend */}
          <div className="absolute bottom-3 lg:bottom-5 right-3 lg:right-5 bg-white/95 p-3 lg:p-4 rounded-lg shadow-md text-xs lg:text-sm">
            <div className="space-y-1 lg:space-y-2">
              <div className="flex items-center gap-2 lg:gap-3 text-xs lg:text-sm">
                <div className="w-4 lg:w-5 h-4 lg:h-5 rounded-full" style={{backgroundColor: "#ff9ff3"}}></div>
                <span>Provider</span>
              </div>
              <div className="flex items-center gap-2 lg:gap-3 text-xs lg:text-sm">
                <div className="w-4 lg:w-5 h-4 lg:h-5 rounded-full" style={{backgroundColor: "#95a5a6"}}></div>
                <span>Class</span>
              </div>
              <div className="flex items-center gap-2 lg:gap-3 text-xs lg:text-sm">
                <div className="w-4 lg:w-5 h-4 lg:h-5 rounded-full bg-yellow-400"></div>
                <span>Singleton</span>
              </div>
              <div className="flex items-center gap-2 lg:gap-3 text-xs lg:text-sm">
                <div className="w-4 lg:w-5 h-4 lg:h-5 rounded-full bg-red-400"></div>
                <span>Circular Dependency</span>
              </div>
              <div className="mt-2 lg:mt-3 pt-1 lg:pt-2 border-t border-gray-200">
                <div className="text-xs font-medium text-gray-600 mb-1 lg:mb-2">Relationships:</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 lg:w-4 h-0.5 bg-blue-500"></div>
                    <span>extends</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 lg:w-4 h-0.5 bg-green-500"></div>
                    <span>depends</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 lg:w-4 h-0.5 bg-purple-500"></div>
                    <span>provides</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 lg:w-4 h-0.5 bg-orange-500"></div>
                    <span>injects</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .circular {
          stroke-dasharray: 5, 5;
          animation: dash 20s linear infinite;
        }
        
        @keyframes dash {
          to {
            stroke-dashoffset: -100;
          }
        }
      `}</style>
    </div>
  );
};

export default Visualizer;