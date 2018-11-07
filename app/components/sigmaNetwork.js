'use strict';

/* Services */

angular.module('app.components.sigmaNetworkComponent', [])

  .directive('sigmaNetwork', function(
    $timeout,
    dataLoader,
    scalesUtils,
    layoutCache,
    storage
  ){
    return {
      restrict: 'E'
      ,templateUrl: 'components/sigmaNetwork.html'
      ,scope: {
        suspendLayout: '=',             // Optional. Stops layout when suspendLayout becomes true
        startLayoutOnShow: '=',         // Optional. Starts layout when suspendLayout becomes false
        startLayoutOnLoad: '=',         // Optional. Default: true
        onNodeClick: '=',
        colorAttId: '=',
        sizeAttId: '=',
        attRecheck: '=',                // Optional. Just a trick: change it to check attributes again
        nodeFilter: '=',                // Optional. Used to display only certain nodes (the others are present but muted)
        hardFilter: '=',                // Optional. When enabled, hidden nodes are completely removed
        editableAttributes: '=',        // Optional. Allows to unset color and size attributes (close buttons)
        getRenderer: '=',
        defaultZoomShowPercent: '=',    // Optional. If set to n, camera centered to barycenter with n% nodes visible
        hideCommands: '=',              // Optional
        hideKey: '=',                   // Optional
        hideLabels: '=',                // Optional
        enableLayout: '=',
        layoutCacheKey: '=',            // Optional. Used to cache and recall layout.
        neverTooBig: '='                // Optional. When enabled, the warning nerver shows
      }
      ,link: function($scope, el, attrs) {
        var renderer
        var networkDisplayThreshold = storage.get('networkDisplayThreshold') || 1000

        $scope.networkData = dataLoader.get()
        $scope.nodesCount
        $scope.edgesCount
        $scope.tooBig = false
        $scope.loaded = false
        $scope.layout
        $scope.colorAtt
        $scope.sizeAtt
        $scope.barycentricDefaultCam

        $scope.stateOnSuspendLayout = ($scope.startLayoutOnLoad === undefined || $scope.startLayoutOnLoad)

        $scope.$watch('networkData.loaded', function(){
          if ( $scope.networkData.loaded ) {
            $scope.g = $scope.networkData.g.copy()
            $scope.loaded = true
            $scope.nodesCount = $scope.g.order
            $scope.edgesCount = $scope.g.size
            $scope.tooBig = !$scope.neverTooBig && $scope.nodesCount > networkDisplayThreshold
            updateColorFilter()
            updateSizeFilter()
            updateNodeAppearance()
            refreshSigma()
          }
        })

        $scope.$watch('colorAttId', function(){
          updateColorFilter()
          $timeout(updateNodeAppearance, 120)
        })

        $scope.$watch('sizeAttId', function(){
          updateSizeFilter()
          $timeout(updateNodeAppearance, 120)
        })

        $scope.$watch('attRecheck', function(){
          updateSizeFilter()
          $timeout(updateNodeAppearance, 120)
        })

        $scope.$watch('onNodeClick', updateMouseEvents)

        $scope.$watch('suspendLayout', function(){
          if ($scope.layout === undefined) { return }
          if ($scope.suspendLayout === true) {
            $scope.stateOnSuspendLayout = $scope.layout.running
            $scope.stopLayout()
          } else if ($scope.suspendLayout === false) {
            if ($scope.startLayoutOnShow === true || $scope.stateOnSuspendLayout) {
              $scope.startLayout()
            }
          }
        })

        $scope.$watch('nodeFilter', updateNodeAppearance)

        $scope.displayLargeNetwork = function() {
          networkDisplayThreshold = $scope.nodesCount+1
          storage.set('networkDisplayThreshold', networkDisplayThreshold)
          $scope.tooBig = false
          refreshSigma()
        }

        $scope.stopLayout = function() {
          if ($scope.layout === undefined) { return }
          $scope.layout.stop()
          if ($scope.layoutCacheKey) {
            layoutCache.store($scope.layoutCacheKey, $scope.g, $scope.layout.running)
          }
        }

        $scope.startLayout = function() {
          if ($scope.layout === undefined) { return }
          $scope.layout.start()
        }

        $scope.restoreOriginalLayout = function() {
          // $scope.g = $scope.networkData.g.copy()
          layoutCache.clear($scope.layoutCacheKey)
          if ($scope.layout === undefined) { return }
          $scope.layout.stop()
          $scope.g.nodes().forEach(function(nid){
            $scope.g.setNodeAttribute(nid, 'x', $scope.networkData.g.getNodeAttribute(nid, 'x'))
            $scope.g.setNodeAttribute(nid, 'y', $scope.networkData.g.getNodeAttribute(nid, 'y'))
          })
        }

        // These functions will be initialized at Sigma creation
        $scope.zoomIn = function(){}
        $scope.zoomOut = function(){}
        $scope.resetCamera = function(){}

        $scope.$on("$destroy", function(){
          if ($scope.layoutCacheKey) {
            layoutCache.store($scope.layoutCacheKey, $scope.g, $scope.layout.running)
          }
          if ($scope.layout) {
            $scope.layout.kill()
          }
          renderer.kill()
        })

        /// Functions

        function updateColorFilter(){
          if ( $scope.g === undefined ) return
          if ($scope.colorAttId) {
            $scope.colorAtt = $scope.networkData.nodeAttributesIndex[$scope.colorAttId]
          } else {
            $scope.colorAtt = undefined
          }
        }

        function updateSizeFilter(){
          if ( $scope.g === undefined ) return
          if ($scope.sizeAttId) {
            $scope.sizeAtt = $scope.networkData.nodeAttributesIndex[$scope.sizeAttId]
          } else {
            $scope.sizeAtt = undefined
          }
        }

        function updateNodeAppearance() {
          if ($scope.networkData.loaded) {

            var g = $scope.g

            var settings = {}
            settings.default_node_color = '#969390'
            settings.default_node_color_muted = '#EEE'
            settings.default_edge_color = '#DDD'
            settings.default_edge_color_muted = '#FAFAFA'


            /// NODES

            // Filter
            var nodeFilter
            if ($scope.hardFilter) {
              g.nodes().forEach(function(nid) {
                if (!$scope.nodeFilter(nid)) {
                  g.dropNode(nid)
                }
              })

              nodeFilter = function(d){return d}
            } else {
              nodeFilter = $scope.nodeFilter || function(d){return d}
            }

            // Update positions from cache
            if ($scope.layoutCacheKey) {
              var wasRunning = layoutCache.recall($scope.layoutCacheKey, g)
              if (wasRunning && $scope.enableLayout && $scope.layout && !$scope.layout.running) {
                $scope.startLayout()
              } else if (wasRunning == false && $scope.layout && $scope.layout.running) {
                $scope.stopLayout()
              }
            }

            // Size
            var nodesDensity = g.order / (el[0].offsetWidth * el[0].offsetHeight)
            var standardArea =  0.03 / nodesDensity
            var rScale = scalesUtils.getRScale()
            var getSize
            if ($scope.sizeAttId) {
              var sizeAtt = $scope.networkData.nodeAttributesIndex[$scope.sizeAttId]
              var areaScale = scalesUtils.getAreaScale(sizeAtt.min, sizeAtt.max, sizeAtt.areaScaling.min, sizeAtt.areaScaling.max, sizeAtt.areaScaling.interpolation)
              getSize = function(nid){ return rScale(sizeAtt.areaScaling.max * areaScale(g.getNodeAttribute(nid, sizeAtt.id)) * standardArea / 10) }
            } else {
              // Trick: a barely visible size difference by degree
              // (helps hierarchizing node labels)
              getSize = function(nid){ return rScale(standardArea + 0.1 * Math.log(1 + g.degree(nid)) ) }
            }

            // Color
            var getColor
            if ($scope.colorAttId) {
              var colorAtt = $scope.networkData.nodeAttributesIndex[$scope.colorAttId]
              if (colorAtt.type == 'partition') {
                var colorByModality = {}
                colorAtt.modalities.forEach(function(m){
                  colorByModality[m.value] = m.color
                })
                getColor = function(nid){ return colorByModality[g.getNodeAttribute(nid, colorAtt.id)] || '#000' }
              } else if (colorAtt.type == 'ranking-color') {
                var colorScale = scalesUtils.getColorScale(colorAtt.min, colorAtt.max, colorAtt.colorScale, colorAtt.invertScale, colorAtt.truncateScale)
                getColor = function(nid){ return colorScale(g.getNodeAttribute(nid, colorAtt.id)).toString() }
              } else {
                getColor = function(){ return settings.default_node_color }
              }
            } else {
              getColor = function(){ return settings.default_node_color }
            }

            // Default / muted
            g.nodes().forEach(function(nid){
              g.setNodeAttribute(nid, 'z', 0)
              g.setNodeAttribute(nid, 'size', Math.max(0.0000001, getSize(nid)))
              g.setNodeAttribute(nid, 'color', settings.default_node_color_muted)
            })

            // Color (using node filter)
            g.nodes()
              .filter(nodeFilter)
              .forEach(function(nid){
                g.setNodeAttribute(nid, 'z', 1)
                g.setNodeAttribute(nid, 'color', getColor(nid))
              })

            /// EDGES

            // Default / muted
            g.edges().forEach(function(eid){
              g.setEdgeAttribute(eid, 'z', 0)
              g.setEdgeAttribute(eid, 'color', settings.default_edge_color_muted)
            })

            // Color (using node filter)
            g.edges()
              .filter(function(eid){
                return nodeFilter(g.source(eid)) && nodeFilter(g.target(eid))
              })
              .forEach(function(eid){
                g.setEdgeAttribute(eid, 'z', 1)
                g.setEdgeAttribute(eid, 'color', settings.default_edge_color)
              })
          }
        }

        function refreshSigma() {
          $timeout(function(){

            var settings = {}
            settings.default_ratio = 1.2
            settings.default_x = 0.5
            settings.default_y = 0.5

            var container = document.getElementById('sigma-div')
            if (!container) return
            container.innerHTML = ''
            renderer = new Sigma.WebGLRenderer($scope.g, container, {
              labelFont: "Quicksand",
              labelWeight: '400',
              renderLabels: !$scope.hideLabels,
              zIndex: true
            })

            $scope.zoomIn = function(){
              var camera = renderer.getCamera()
              var state = camera.getState()
              camera.animate({ratio: state.ratio / 1.5})
            }

            $scope.zoomOut = function(){
              var camera = renderer.getCamera()
              var state = camera.getState()
              camera.animate({ratio: state.ratio * 1.5})
            }

            $scope.resetCamera = function(){
              var camera = renderer.getCamera()
              var state = camera.getState()
              if ($scope.barycentricDefaultCam) {
                camera.animate($scope.barycentricDefaultCam)
              } else {
                camera.animate({ratio: settings.default_ratio, x:settings.default_x, y:settings.default_y})
              }
            }

            // Defaults to some unzoom
            var camera = renderer.getCamera()
            var state = camera.getState()
            if ($scope.defaultZoomShowPercent) {
              // If option enabled, compute the default view from barycenter
              var xyScales = getXYScales_camera(1, 1, 0.5, 0.5, 1)
              var xExtent = d3.extent($scope.g.nodes(), function(nid){ return $scope.g.getNodeAttribute(nid, 'x') })
              var yExtent = d3.extent($scope.g.nodes(), function(nid){ return $scope.g.getNodeAttribute(nid, 'y') })
              var xMean = (xExtent[0] + xExtent[1])/2
              var yMean = (yExtent[0] + yExtent[1])/2
              var sizeRatio =  Math.max((xExtent[1] - xExtent[0]), (yExtent[1] - yExtent[0]))
              var xScale = d3.scaleLinear().range([0, 1]).domain([ xMean - sizeRatio / 2, xMean + sizeRatio / 2])
              var yScale = d3.scaleLinear().range([0, 1]).domain([ yMean - sizeRatio / 2, yMean + sizeRatio / 2])

              var xBary = d3.sum($scope.g.nodes(), function(nid){ return $scope.g.getNodeAttribute(nid, 'x') })/$scope.g.order
              var yBary = d3.sum($scope.g.nodes(), function(nid){ return $scope.g.getNodeAttribute(nid, 'y') })/$scope.g.order

              // Iteratively find which ratio displays n% of the nodes by dichotomic search
              var visiblePart = function(ratio){
                var xyScales = getXYScales_camera(1, 1, xScale(xBary), yScale(yBary), ratio)
                return $scope.g.nodes().filter(function(nid){
                  var x = xyScales[0]($scope.g.getNodeAttribute(nid, 'x'))
                  var y = xyScales[1]($scope.g.getNodeAttribute(nid, 'y'))
                  return x > 0 && x < 1 && y > 0 && y < 1
                }).length / $scope.g.order
              }
              var visibleTarget = Math.max(0, Math.min(1, (+$scope.defaultZoomShowPercent || 100) / 100))
              var minRatio = 0
              var maxRatio = 1
              var visible
              var limit = 100
              do {
                maxRatio *= 1.2
                visible = visiblePart((minRatio+maxRatio)/2)
              } while (visible < visibleTarget && limit-->0)
              var offset, closeEnough
              do {
                visible = visiblePart((minRatio+maxRatio)/2)
                offset = visible - visibleTarget
                closeEnough = Math.abs(offset) <= 0.001 * visibleTarget
                if (!closeEnough) {
                  if (offset > 0) {
                    maxRatio = (minRatio+maxRatio)/2
                  } else {
                    minRatio = (minRatio+maxRatio)/2
                  }
                }
              } while (!closeEnough && limit-->0)
              var unzoom = 0.08 // This additional unzoom adds a slight margin that's more comfortable
              $scope.barycentricDefaultCam = {ratio: (1+unzoom) * (minRatio + maxRatio)/2, x:xScale(xBary), y:yScale(yBary)}
              camera.animate($scope.barycentricDefaultCam)
            } else {
              camera.animate({ratio: settings.default_ratio, x:settings.default_x, y:settings.default_y})
            }

            $scope.getRenderer = function() {
              return renderer
            }

            if ($scope.layout) {
              $scope.layout.kill()
            }
            $scope.layout = new Graph.library.FA2Layout($scope.g, {
              settings: {
                barnesHutOptimize: $scope.g.order > 2000,
                strongGravityMode: true,
                gravity: 0.05,
                scalingRatio: 10,
                slowDown: 1 + Math.log($scope.g.order)
              }
            });
            if (
              ($scope.startLayoutOnLoad || $scope.startLayoutOnLoad === undefined)
              && (!$scope.suspendLayout || $scope.suspendLayout === undefined)
            ) {
              $scope.layout.start()
            }

            updateMouseEvents()

          })
        }

        function updateMouseEvents() {
          if (renderer === undefined) {
            return
          }

          if ($scope.onNodeClick !== undefined) {
            renderer.on('clickNode', function(e){
              $timeout(function(){
                $scope.onNodeClick(e.node)
              })
            })
            renderer.on('overNode', function(e){
              el[0].classList.add('pointable')
            })
            renderer.on('outNode', function(e){
              el[0].classList.remove('pointable')
            })

          }
        }

        function getXYScales_camera(width, height, x, y, ratio) {
          var g = $scope.g
          var xScale = d3.scaleLinear()
            .range([- (x-0.5) * width / ratio, width - (x-0.5) * width / ratio])
          var yScale = d3.scaleLinear()
            .range([height + (y-0.5) * height / ratio, (y-0.5) * height / ratio])

          var xExtent = d3.extent(g.nodes(), function(nid){ return g.getNodeAttribute(nid, 'x') })
          var yExtent = d3.extent(g.nodes(), function(nid){ return g.getNodeAttribute(nid, 'y') })
          var sizeRatio = ratio * Math.max((xExtent[1] - xExtent[0])/width, (yExtent[1] - yExtent[0])/height)
          var xMean = (xExtent[0] + xExtent[1])/2
          var yMean = (yExtent[0] + yExtent[1])/2
          xScale.domain([ xMean - sizeRatio * width / 2, xMean + sizeRatio * width / 2])
          yScale.domain([ yMean - sizeRatio * height / 2, yMean + sizeRatio * height / 2])

          return [xScale, yScale]
        }

      }
    }
  })
