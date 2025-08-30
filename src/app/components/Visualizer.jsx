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
        
        // Add padding
        const padding = 50;
        const scale = Math.min(
          (width - padding * 2) / (graphWidth || width),
          (height - padding * 2) / (graphHeight || height),
          1 // Don't scale up beyond 1x
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
        // Fallback to center reset
        svg.transition()
          .duration(750)
          .call(
            d3.zoom().transform,
            d3.zoomIdentity.translate(0, 0).scale(1)
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

    // Create arrow markers
    svg.append("defs").selectAll("marker")
      .data(["normal", "circular"])
      .enter().append("marker")
      .attr("id", d => `arrow-${d}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", d => d === "circular" ? "#ff6b6b" : "#999");

    // Create links
    const link = g.append("g")
      .selectAll("path")
      .data(validLinks)
      .enter().append("path")
      .attr("fill", "none")
      .attr("stroke", d => {
        const isCircular = circularPairs.some(pair => 
          (pair[0] === d.source && pair[1] === d.target) ||
          (pair[0] === d.target && pair[1] === d.source)
        );
        return isCircular ? "#ff6b6b" : "#999";
      })
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.4)
      .attr("marker-end", d => {
        const isCircular = circularPairs.some(pair => 
          (pair[0] === d.source && pair[1] === d.target) ||
          (pair[0] === d.target && pair[1] === d.source)
        );
        return `url(#arrow-${isCircular ? "circular" : "normal"})`;
      })
      .classed("circular", d => {
        return circularPairs.some(pair => 
          (pair[0] === d.source && pair[1] === d.target) ||
          (pair[0] === d.target && pair[1] === d.source)
        );
      });

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
            // Focus on this node's relationships and fetch class info
            await focusOnNode(d.id);
            await fetchClassInfo(d.id);
            
            // Visual feedback for clicked node
            d3.selectAll(".node circle")
              .style("stroke", node => node.id === d.id ? "#ff6b6b" : "#fff")
              .style("stroke-width", node => node.id === d.id ? 4 : 2);
          } catch (error) {
            console.error('Error handling node click:', error);
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
      const response = await fetch('/api/base-classes');
      
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
    

    if (apiData.base_classes) {
      nodes = apiData.base_classes.map(cls => ({
        id: convertDotToSlash(cls.name),
        type: cls.type || "class",
        scope: cls.scope || "module",
        isProvider: cls.is_provider || false,
        fullName: convertDotToSlash(cls.name),
        ...cls
      }));

      nodes.push({
        id: "Object",
        type: "class",
        scope: "module",
        isProvider: false
      });

      links = apiData.base_classes.map(rel => ({
        source: convertDotToSlash(rel.name),
        target: "Object",
        type: "dependency"
      }));
    }
    
    console.log('Transformed data:', { nodes, links }); // Debug log
    return { nodes, links };
  };

  const fetchClassInfo = async (className) => {
    try {
      await exploreClassRecursively(className, new Set(), new Map(), new Set());
    } catch (err) {
      console.error('Error exploring class hierarchy:', err);
      setError(`Failed to explore class hierarchy: ${err.message}`);
    }
  };

  const exploreClassRecursively = async (className, visited, nodeMap, linkSet, depth = 0) => {
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
      const classResponse = await fetch(`/api/class-info/${encodeURIComponent(apiClassName)}`);
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
            
            // Recursively explore parameter
            await exploreClassRecursively(param.name, visited, nodeMap, linkSet, depth + 1);
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
            
            // Recursively explore component
            await exploreClassRecursively(component.name, visited, nodeMap, linkSet, depth + 1);
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
            
            // Recursively explore injection
            await exploreClassRecursively(injection.name, visited, nodeMap, linkSet, depth + 1);
          }
        }
      }
      
      // Try to fetch child classes for additional relationships
      try {
        const apiChildClassName = className.replace(/\./g, '/');
        const childResponse = await fetch(`/api/child-classes/${encodeURIComponent(apiChildClassName)}`);
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
                if (depth < 3) {
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
      <div className="bg-white/95 backdrop-blur-md p-5 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
            K
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Knit Dependency Visualizer</h1>
            {focusedNode && (
              <p className="text-sm text-gray-600 mt-1">
                Focused on: <span className="font-medium text-indigo-600">{focusedNode}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-4 items-center">
          {previousState && (
            <button
              onClick={goBack}
              className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-2"
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
              className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-2"
            >
              Clear Focus
            </button>
          )}
          <select 
            value={currentLayout}
            onChange={(e) => setCurrentLayout(e.target.value)}
            className="px-4 py-2 border-2 border-gray-200 rounded-lg bg-white cursor-pointer text-sm transition-colors focus:border-indigo-500 focus:outline-none"
          >
            <option value="force">Force Layout</option>
            <option value="circular">Circular Layout</option>
            <option value="hierarchical">Hierarchical Layout</option>
          </select>
          <button
            onClick={analyzeProject}
            disabled={loading}
            className={`bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:-translate-y-0.5 ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Loading Base Classes...' : 'Load Base Classes'}
          </button>
          <button
            onClick={() => detectIssues()}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:-translate-y-0.5"
          >
            Detect Issues
          </button>
          <button
            onClick={exportGraph}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:-translate-y-0.5"
          >
            Export Graph
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-5 mb-5 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <span className="text-red-500">⚠️</span>
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 gap-5 p-5 max-w-7xl w-full mx-auto">
        {/* Sidebar */}
        <div className="w-80 bg-white/95 backdrop-blur-md rounded-2xl p-6 shadow-lg overflow-y-auto max-h-full">
          <input
            type="text"
            placeholder="Search dependencies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 border-2 border-gray-200 rounded-lg text-sm mb-5 transition-colors focus:border-indigo-500 focus:outline-none"
          />
          
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

          {/* Issues Section */}
          <div>
            <h3 className="text-gray-800 text-lg font-semibold mb-4 flex items-center gap-2">
              ⚠️ Detected Issues
            </h3>
            <div className="space-y-3">
              {issues.length === 0 ? (
                <div className="bg-white border-l-4 border-blue-400 p-4 rounded-lg shadow-sm">
                  <div className="font-semibold text-gray-800 text-sm mb-1">No issues detected</div>
                  <div className="text-gray-600 text-xs leading-relaxed">Your dependency graph looks healthy!</div>
                </div>
              ) : (
                issues.map((issue, index) => (
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
                ))
              )}
            </div>
          </div>

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
        <div className="flex-1 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg relative overflow-hidden">
          <svg ref={svgRef} className="w-full h-full"></svg>
          
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
          <div className="absolute bottom-5 right-5 bg-white/95 p-4 rounded-lg shadow-md">
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-indigo-500"></div>
                <span>Module/Component</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-cyan-400"></div>
                <span>Service</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-cyan-500"></div>
                <span>Repository</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full" style={{backgroundColor: "#ff9ff3"}}></div>
                <span>Provider</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full" style={{backgroundColor: "#95a5a6"}}></div>
                <span>Class</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-yellow-400"></div>
                <span>Singleton</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-red-400"></div>
                <span>Circular Dependency</span>
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