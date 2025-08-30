import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { 
  useProjectData, 
  useClassExploration, 
  useFocusNavigation, 
  useApiOperations 
} from '../hooks/useVisualizerState';
import { 
  calculateStatistics, 
  detectIssues, 
  detectCircularDependencies,
  calculateNodeLevels,
  filterNodesBySearch 
} from '../utils/dataUtils';
import { 
  getNodeColor, 
  getLinkColor, 
  getMarkerType, 
  createArrowMarkers,
  setupZoomBehavior,
  getFilteredData 
} from '../utils/d3Utils';

const Visualizer = () => {
  const svgRef = useRef();
  const tooltipRef = useRef();
  const simulationRef = useRef();
  
  // State from custom hooks
  const { projectData, setProjectData, statistics, setStatistics, issues, setIssues } = useProjectData();
  const { 
    selectedNode, 
    setSelectedNode, 
    classInfo, 
    setClassInfo, 
    loadingClassInfo, 
    setLoadingClassInfo,
    exploredNodes, 
    setExploredNodes, 
    isExploring, 
    setIsExploring,
    convertDotToSlash,
    fetchClassInfo 
  } = useClassExploration();
  const { 
    previousState, 
    setPreviousState, 
    focusedNode, 
    setFocusedNode, 
    loadingFocus, 
    setLoadingFocus,
    focusOnNode,
    goBack 
  } = useFocusNavigation();
  const { loading, setLoading, error, setError, analyzeProject } = useApiOperations();

  // Local state
  const [currentLayout, setCurrentLayout] = useState('force');
  const [searchTerm, setSearchTerm] = useState('');

  // Focus function with exact original behavior
  const handleFocusOnNode = async (nodeId) => {
    const result = await focusOnNode(nodeId, projectData);
    if (result) {
      setProjectData(result);
      // Reset view after focusing
      setTimeout(() => {
        resetView();
      }, 100);
    }
  };

  // Go back function with exact original behavior
  const handleGoBack = () => {
    const result = goBack();
    if (result) {
      setProjectData(result);
      
      // Clear class details section when going back
      setSelectedNode(null);
      setClassInfo(null);
      setExploredNodes(new Set());
      
      // Reset visual selection
      setTimeout(() => {
        d3.selectAll(".node circle")
          .style("stroke", "#fff")
          .style("stroke-width", 2);
      }, 50);
      
      // Reset view after state change
      setTimeout(() => {
        resetView();
      }, 100);
    }
  };

  // Reset view function (exact copy from original)
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

  // Utility functions using the exact original logic
  const detectCircularDependenciesLocal = useCallback(() => {
    return detectCircularDependencies(projectData.nodes, projectData.links);
  }, [projectData]);

  const calculateNodeLevelsLocal = useCallback(() => {
    return calculateNodeLevels(projectData.nodes, projectData.links);
  }, [projectData]);

  const updateStatistics = useCallback(() => {
    const newStats = calculateStatistics(projectData.nodes, projectData.links, focusedNode);
    setStatistics(newStats);
  }, [projectData, focusedNode, setStatistics]);

  const detectIssuesLocal = useCallback(() => {
    const detectedIssues = detectIssues(projectData.nodes, projectData.links, focusedNode);
    setIssues(detectedIssues);
  }, [projectData, focusedNode, setIssues]);

  // API function with exact original behavior
  const handleAnalyzeProject = async () => {
    try {
      const transformedData = await analyzeProject(convertDotToSlash, setPreviousState, setFocusedNode);
      setProjectData(transformedData);
      
      // Reset view after loading new data with longer delay for force simulation
      setTimeout(() => {
        resetView();
      }, 1000);
    } catch (err) {
      // Error already handled in the hook
    }
  };

  // Class info fetch with exact original behavior
  const handleFetchClassInfo = async (className) => {
    try {
      await fetchClassInfo(className, (result) => {
        if (result) {
          setProjectData(result);
        }
      });
    } catch (err) {
      setError(`Failed to explore class hierarchy: ${err.message}`);
    }
  };

  // Render graph with exact original D3 logic
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

    // Use exact original filtering logic
    const { visibleNodes, validLinks } = getFilteredData(projectData, focusedNode);

    console.log(`Showing ${visibleNodes.length} out of ${projectData.nodes.length} nodes`);

    // Setup zoom behavior
    setupZoomBehavior(svg, g);

    // Detect circular dependencies
    const circularPairs = detectCircularDependenciesLocal();

    // Create arrow markers
    createArrowMarkers(svg);

    // Function to get link color with circular detection
    const getLinkColorWithCircular = (link) => getLinkColor(link, circularPairs);
    const getMarkerTypeWithCircular = (link) => getMarkerType(link, circularPairs);

    // Create links (exact original logic)
    const link = g.append("g")
      .selectAll("path")
      .data(validLinks)
      .enter().append("path")
      .attr("fill", "none")
      .attr("stroke", getLinkColorWithCircular)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.7)
      .attr("marker-end", d => `url(#arrow-${getMarkerTypeWithCircular(d)})`)
      .classed("circular", d => {
        return circularPairs.some(pair => 
          (pair[0] === d.source && pair[1] === d.target) ||
          (pair[0] === d.target && pair[1] === d.source)
        );
      });

    // Add relationship labels on links (exact original)
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

    // Create nodes (exact original logic)
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
        // Exact original hover logic
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

        // Show tooltip with dependency info (exact original)
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
        // Reset all visual effects (exact original)
        d3.selectAll(".node circle")
          .style("opacity", 1)
          .style("stroke-width", 2);
        
        d3.selectAll("path")
          .style("opacity", 0.4)
          .style("stroke-width", 2);
        
        tooltip.style("opacity", 0);
      })
      .on("click", function(event, d) {
        // Exact original click handler
        (async () => {
          try {
            // Set loading state for class info
            setLoadingClassInfo(true);
            setSelectedNode(d.id);
            
            // Focus on this node's relationships and fetch class info
            await handleFocusOnNode(d.id);
            await handleFetchClassInfo(d.id);
            
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

    // Add labels (exact original)
    node.append("text")
      .attr("dy", 25)
      .attr("text-anchor", "middle")
      .text(d => d.id)
      .style("fill", "#333")
      .style("font-size", "12px")
      .style("font-weight", "500")
      .style("pointer-events", "none")
      .style("user-select", "none");

    // Link arc function (exact original)
    const linkArc = (d) => {
      const sourceNode = projectData.nodes.find(n => n.id === (d.source?.id || d.source));
      const targetNode = projectData.nodes.find(n => n.id === (d.target?.id || d.target));
      
      if (!sourceNode || !targetNode) return "";
      
      const dx = targetNode.x - sourceNode.x;
      const dy = targetNode.y - sourceNode.y;
      const dr = Math.sqrt(dx * dx + dy * dy);
      
      return `M${sourceNode.x},${sourceNode.y}A${dr},${dr} 0 0,1 ${targetNode.x},${targetNode.y}`;
    };

    // Setup simulation based on layout (exact original logic)
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
      // Apply static layouts (exact original logic)
      if (currentLayout === 'circular') {
        const radius = Math.min(width, height) / 2 - 100;
        const angleStep = (2 * Math.PI) / visibleNodes.length;
        
        visibleNodes.forEach((node, i) => {
          node.x = width / 2 + radius * Math.cos(i * angleStep - Math.PI / 2);
          node.y = height / 2 + radius * Math.sin(i * angleStep - Math.PI / 2);
        });
      } else if (currentLayout === 'hierarchical') {
        const levels = calculateNodeLevelsLocal();
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

    // Apply search filter (exact original)
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

  }, [projectData, currentLayout, searchTerm, detectCircularDependenciesLocal, calculateNodeLevelsLocal, focusedNode, handleFocusOnNode, handleFetchClassInfo, setLoadingClassInfo, setSelectedNode]);

  // Update statistics when project data changes (exact original)
  useEffect(() => {
    updateStatistics();
  }, [updateStatistics]);

  // Render graph when dependencies change (exact original)
  useEffect(() => {
    renderGraph();
  }, [renderGraph]);

  // Export graph function
  const exportGraph = useCallback(() => {
    const dataStr = JSON.stringify(projectData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = 'dependency-graph.json';
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }, [projectData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-700 flex flex-col">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur-md p-4 lg:p-6 shadow-lg flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
            K
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-semibold text-gray-800">
              Knit Dependency Visualizer
            </h1>
            {focusedNode && (
              <p className="text-sm text-gray-600 mt-1">
                Focused on: <span className="font-medium text-indigo-600">{focusedNode}</span>
              </p>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 lg:gap-4 items-center">
          <button
            onClick={handleAnalyzeProject}
            disabled={loading}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-3 lg:px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Analyzing...
              </>
            ) : (
              '📦 Load Base Classes'
            )}
          </button>
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
            onClick={detectIssuesLocal}
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
                        setTimeout(() => {
                          d3.selectAll(".node circle")
                            .style("stroke", "#fff")
                            .style("stroke-width", 2);
                        }, 50);
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
