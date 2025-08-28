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
  
  const simulationRef = useRef();

  const getNodeColor = useCallback((node) => {
    const colors = {
      module: "#667eea",
      service: "#48dbfb",
      repository: "#00d2d3",
      singleton: "#feca57"
    };
    
    if (node.scope === "singleton" && node.type === "service") {
      return colors.singleton;
    }
    return colors[node.type] || "#667eea";
  }, []);

  const detectCircularDependencies = useCallback(() => {
    const graph = {};
    projectData.nodes.forEach(node => {
      graph[node.id] = [];
    });
    
    projectData.links.forEach(link => {
      const source = link.source.id || link.source;
      const target = link.target.id || link.target;
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
        .filter(link => link.source === nodeId || link.source.id === nodeId)
        .forEach(link => {
          const targetId = link.target.id || link.target;
          dfs(targetId, level + 1);
        });
    }
    
    projectData.nodes
      .filter(node => !projectData.links.some(link => 
        link.target === node.id || link.target.id === node.id))
      .forEach(node => dfs(node.id, 0));
    
    return levels;
  }, [projectData]);

  const updateStatistics = useCallback(() => {
    const circularDeps = detectCircularDependencies();
    const depths = calculateNodeLevels();
    const maxDepth = Math.max(...Object.values(depths), 0);
    const avgDeps = projectData.links.length / projectData.nodes.length;
    
    setStatistics({
      totalModules: projectData.nodes.length,
      totalDependencies: projectData.links.length,
      circularDeps: circularDeps.length,
      maxDepth: maxDepth,
      avgDeps: parseFloat(avgDeps.toFixed(2))
    });
  }, [projectData, detectCircularDependencies, calculateNodeLevels]);

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
        l.source === node.id || l.source.id === node.id
      ).length;
      
      if (deps > 5) {
        detectedIssues.push({
          type: 'warning',
          title: 'High Coupling',
          description: `${node.id} has ${deps} dependencies, consider refactoring`
        });
      }
    });
    
    // Check for unused modules
    projectData.nodes.forEach(node => {
      const isUsed = projectData.links.some(l => 
        l.target === node.id || l.target.id === node.id
      );
      const hasOutputs = projectData.links.some(l => 
        l.source === node.id || l.source.id === node.id
      );
      
      if (!isUsed && !hasOutputs && node.id !== 'AppModule') {
        detectedIssues.push({
          type: 'info',
          title: 'Isolated Component',
          description: `${node.id} appears to be isolated from the dependency graph`
        });
      }
    });
    
    setIssues(detectedIssues);
  }, [projectData, detectCircularDependencies]);

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

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Detect circular dependencies
    const circularPairs = detectCircularDependencies();

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
      .data(projectData.links)
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
      .data(projectData.nodes)
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
        const dependencies = projectData.links
          .filter(link => link.source === d.id || link.source.id === d.id)
          .map(link => link.target.id || link.target);
        
        const dependents = projectData.links
          .filter(link => link.target === d.id || link.target.id === d.id)
          .map(link => link.source.id || link.source);
        
        tooltip.html(`
          <div class="font-semibold">${d.id}</div>
          <div>Type: ${d.type}</div>
          <div>Scope: ${d.scope}</div>
          <div>Dependencies: ${dependencies.length > 0 ? dependencies.join(", ") : "None"}</div>
          <div>Dependents: ${dependents.length > 0 ? dependents.join(", ") : "None"}</div>
        `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 10) + "px")
        .style("opacity", 1);
      })
      .on("mouseout", function() {
        tooltip.style("opacity", 0);
      })
      .on("click", function(event, d) {
        const connectedNodes = new Set([d.id]);
        
        projectData.links.forEach(link => {
          if (link.source === d.id || link.source.id === d.id) {
            connectedNodes.add(link.target.id || link.target);
          }
          if (link.target === d.id || link.target.id === d.id) {
            connectedNodes.add(link.source.id || link.source);
          }
        });
        
        d3.selectAll("circle")
          .style("opacity", node => connectedNodes.has(node.id) ? 1 : 0.3);
        
        d3.selectAll("path")
          .style("opacity", link => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            return (sourceId === d.id || targetId === d.id) ? 1 : 0.1;
          });
        
        setTimeout(() => {
          d3.selectAll("circle").style("opacity", 1);
          d3.selectAll("path").style("opacity", 0.4);
        }, 3000);
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
      const sourceNode = projectData.nodes.find(n => n.id === d.source.id || n.id === d.source);
      const targetNode = projectData.nodes.find(n => n.id === d.target.id || n.id === d.target);
      
      if (!sourceNode || !targetNode) return "";
      
      const dx = targetNode.x - sourceNode.x;
      const dy = targetNode.y - sourceNode.y;
      const dr = Math.sqrt(dx * dx + dy * dy);
      
      return `M${sourceNode.x},${sourceNode.y}A${dr},${dr} 0 0,1 ${targetNode.x},${targetNode.y}`;
    };

    // Setup simulation based on layout
    if (currentLayout === 'force') {
      simulationRef.current = d3.forceSimulation(projectData.nodes)
        .force("link", d3.forceLink(projectData.links)
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
        const angleStep = (2 * Math.PI) / projectData.nodes.length;
        
        projectData.nodes.forEach((node, i) => {
          node.x = width / 2 + radius * Math.cos(i * angleStep - Math.PI / 2);
          node.y = height / 2 + radius * Math.sin(i * angleStep - Math.PI / 2);
        });
      } else if (currentLayout === 'hierarchical') {
        const levels = calculateNodeLevels();
        const maxLevel = Math.max(...Object.values(levels));
        const levelHeight = height / (maxLevel + 2);
        const nodesPerLevel = {};
        
        projectData.nodes.forEach(node => {
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

  }, [projectData, currentLayout, searchTerm, detectCircularDependencies, calculateNodeLevels, getNodeColor]);

  const analyzeProject = () => {
    const newNodes = [
      { id: "ViewModule", type: "module", scope: "singleton" },
      { id: "RouterService", type: "service", scope: "singleton" },
      { id: "StateManager", type: "service", scope: "singleton" }
    ];
    
    const newLinks = [
      { source: "ViewModule", target: "RouterService", type: "provides" },
      { source: "RouterService", target: "StateManager", type: "inject" },
      { source: "StateManager", target: "CacheManager", type: "inject" },
      { source: "ViewModule", target: "AuthService", type: "inject" }
    ];
    
    setProjectData(prev => ({
      nodes: [...prev.nodes, ...newNodes],
      links: [...prev.links, ...newLinks]
    }));
  };

  const exportGraph = () => {
    const graphData = {
      nodes: projectData.nodes,
      links: projectData.links.map(link => ({
        source: link.source.id || link.source,
        target: link.target.id || link.target,
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
          <h1 className="text-2xl font-semibold text-gray-800">Knit Dependency Visualizer</h1>
        </div>
        <div className="flex gap-4 items-center">
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
            className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:-translate-y-0.5"
          >
            Load Sample Project
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
        </div>

        {/* Visualization Container */}
        <div className="flex-1 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg relative overflow-hidden">
          <svg ref={svgRef} className="w-full h-full"></svg>
          
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