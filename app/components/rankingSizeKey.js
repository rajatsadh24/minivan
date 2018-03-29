'use strict';

/* Services */

angular.module('app.components.rankingSizeKey', [])

.directive('rankingSizeKey', function($timeout, networkData, scalesUtils, $filter){
  return {
    restrict: 'A',
    templateUrl: 'components/rankingSizeKey.html',
    scope: {
      att: '=',
      scales: '='
    },
    link: function($scope, el, attrs) {
    	$scope.elementSize = 30
    	$scope.$watch('att', update)
    	$scope.$watch('scales', update)

    	var rScale = scalesUtils.getRScale()

      function update() {
      	var keyElementsCount = 5
      	if ($scope.att.integer){
    			keyElementsCount = Math.min(keyElementsCount, $scope.att.max - $scope.att.min)
    		}
      	var keyElements = []
      	if ($scope.att && $scope.scales) {
	      	var i
	      	for (i=0; i<keyElementsCount; i++) {
	      		keyElements.push(i)
	      	}
	      	keyElements = keyElements.map(function(d){
	      		var val = $scope.att.min + (keyElementsCount - d - 1) * $scope.att.max / (keyElementsCount - 1)
	      		if ($scope.att.integer){
	      			val = Math.round(val)
	      		}
	      		var r = $scope.scales.rFactor * rScale($scope.scales.areaScale(val))
	      		return {
	      			val: val,
	      			r: r
	      		}
	      	})
      	}
	      $scope.keyElements = keyElements
      }
    }
  }
})

.directive('rankingSizeKeyItem', function($timeout){
	return {
    restrict: 'E',
    template: '<small style="opacity:0.5;">...</small>',
    scope: {
      keyElement: '='
    },
    link: function($scope, el, attrs) {
    	var container = el[0]

    	$scope.$watch('keyElement', redraw)

    	// init
    	redraw()
    	
    	function redraw() {
    		$timeout(function(){
	        container.innerHTML = '';

	        var margin = {top: 0, right: 0, bottom: 0, left: 0},
					    width = container.offsetWidth - margin.left - margin.right,
					    height = container.offsetHeight - margin.top - margin.bottom;
					
					var svg = d3.select(container).append('svg')
					    .attr('width', width + margin.left + margin.right)
					    .attr('height', height + margin.top + margin.bottom)
					  .append('g')
					    .attr('transform', 
					          'translate(' + margin.left + ',' + margin.top + ')');

					svg.append('circle')
				      .attr('cx', width/2 )
				      .attr('cy', height/2 )
				      .attr('r', $scope.keyElement.r)
				      .attr('fill', '#999')
	      })
    	}
    }
  }
})