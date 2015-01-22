(function() {
'use strict';
var SELECT_EDGE_MARGIN = 8;
var SELECT_NEXT_ID = 0;
var SELECT_OPTION_HEIGHT = 64;

/*
<md-select ng-model="choice" ng-model-options="{ trackBy: 'choice.id' }">
  <md-option ng-repeat="opt in options">
  </md-option>
</md-select>
*/

// TODO
// <md-select in markup will turn into:
// <div class=“md-select-button-container”> <md-button /> <ul role=“menu /> </div>
//
// In rendered select:
// <md-select> should have role="menu"
// <md-option> should have role="menuitem"
// <md-optgroup should have role="menu"
//
// TODO fix positioning when not scrollable

angular.module('material.components.select', [
  'material.core'
])

.directive('mdSelect', SelectDirective)
.directive('mdLabel', LabelDirective)
.directive('mdOption', OptionDirective)
.directive('mdOptgroup', OptgroupDirective)
.provider('$mdSelect', SelectProvider);

function SelectDirective($parse, $timeout) {

  return {
    restrict: 'E',
    require: ['mdSelect', 'ngModel'],
    controller: SelectController,
    link: { pre: postLink }
  };

  function postLink(scope, element, attr, ctrls) {
    var selectCtrl = ctrls[0];
    var ngModel = ctrls[1];
    var selectNode = element[0];

    $timeout(checkOverflow, 0, false);
    element.on('click', clickListener);
    selectCtrl.init(ngModel);

    function checkOverflow() {
      var isOverflow = selectNode.scrollHeight > selectNode.offsetHeight;
      if (isOverflow) {
        element.addClass('md-overflow');
      }
    }
    
    function clickListener(ev) {
      // If the click's target was a child of an md-option, then get the md-option parent of 
      // the click.
      var option;
      var currentNode = ev.target;
      while (currentNode && currentNode !== selectNode) {
        if (currentNode.$mdOption) {
          option = currentNode;
          break;
        }
        currentNode = currentNode.parentNode;
      }
      if (!option) return;

      scope.$apply(function() {
        var optionCtrl = angular.element(option).controller('mdOption');
        var optionHashKey = selectCtrl.hashGetter(optionCtrl.value);
        var isSelected = selectCtrl.isSelected(optionHashKey);

        if (selectCtrl.isMultiple) {
          if (isSelected) {
            selectCtrl.deselect(optionHashKey);
          } else {
            selectCtrl.select(optionHashKey, optionCtrl.value);
          }
        } else {
          if (!isSelected) {
            selectCtrl.deselect( Object.keys(selectCtrl.selected)[0] );
            selectCtrl.select( optionHashKey, optionCtrl.value );
          }
        }
        selectCtrl.refreshViewValue();
      });
    }
  }

  function SelectController($scope, $element, $attrs) {
    var self = this;
    self.options = {};
    self.selected = {};
    self.isMultiple = angular.isDefined($attrs.mdMultiple) || angular.isDefined($attrs.multiple);

    self.init = function(ngModel) {
      var ngModelExpr = $attrs.ngModel;

      if (ngModel.$options && ngModel.$options.trackBy) {
        var trackByLocals = {};
        var trackByParsed = $parse(ngModel.$options.trackBy);
        self.hashGetter = function(value, parseScope) {
          trackByLocals.$model = value;
          return trackByParsed(parseScope || $scope, trackByLocals);
        };
      } else {
        self.hashGetter = function getHashValue(value) {
          if (angular.isObject(value)) {
            return value.$$mdSelectId || (value.$$mdSelectId = ++SELECT_NEXT_ID);
          }
          return value;
        };
      }


      self.ngModel = ngModel;

      if (self.isMultiple) {
        ngModel.$validators['md-multiple'] = validateArray;
        ngModel.$render = renderMultiple;

        $scope.$watchCollection(ngModelExpr, function(value) {
          if (validateArray(value)) renderMultiple(value);
        });
      } else {
        ngModel.$render = renderSingular;
      }

      function validateArray(modelValue, viewValue) {
        var value = modelValue || viewValue;
        return !value ? true : angular.isArray(value);
      }
    };

    self.isSelected = function(hashKey) {
      return angular.isDefined(self.selected[hashKey]);
    };
    self.select = function(hashKey, hashedValue) {
      var option = self.options[hashKey];
      if (option) {
        option.setSelected(true);
      }
      self.selected[hashKey] = hashedValue;
    };
    self.deselect = function(hashKey) {
      var option = self.options[hashKey];
      if (option) {
        option.setSelected(false);
      }
      delete self.selected[hashKey];
    };

    self.addOption = function(hashKey, optionCtrl) {
      if (angular.isDefined(self.options[hashKey])) {
        throw new Error('Duplicate!');
      }
      self.options[hashKey] = optionCtrl;
      if (self.isSelected(hashKey)) {
        self.select(hashKey, optionCtrl.value);
        self.refreshViewValue();
      }
    };
    self.removeOption = function(hashKey, optionCtrl) {
      delete self.options[hashKey];
    };

    self.refreshViewValue = function() {
      var values = [];
      var option;
      for (var hashKey in self.selected) {
         // If this hashKey in the model has an associated option, push
         // that option's value
         if ((option = self.options[hashKey])) {
           values.push(option.value);
         } else {
           // Otherwise, the given hashKey in the model has no associated option.
           // Get the un-hashed version of the hashKey.
           // This allows the user to put a value in the model that doesn't yet have
           // an associated option.
           values.push(self.selected[hashKey]);
         }
      }
      self.ngModel.$setViewValue(self.isMultiple ? values : values[0]);
    };

    function renderMultiple() {
      var newSelected = self.ngModel.$modelValue || self.ngModel.$viewValue || [];
      if (!angular.isArray(newSelected)) return;

      var oldSelected = Object.keys(self.selected);

      var newSelectedHashed = newSelected.map(self.hashGetter);
      var deselected = oldSelected.filter(function(hash) {
        return newSelectedHashed.indexOf(hash) === -1;
      });
      deselected.forEach(self.deselect);
      newSelectedHashed.forEach(function(hashKey, i) {
        self.select(hashKey, newSelected[i]);
      });
    }
    function renderSingular() {
      var value = self.ngModel.$viewValue || self.ngModel.$modelValue;
      Object.keys(self.selected).forEach(self.deselect);
      self.select( self.hashGetter(value), value );
    }
  }

}

function LabelDirective() {
}

function OptionDirective($mdInkRipple) {

  return {
    restrict: 'E',
    require: ['mdOption', '^mdSelect'],
    template: '<div class="md-text" ng-transclude></div>',
    transclude: true,
    controller: OptionController,
    link: postLink
  };

  function postLink(scope, element, attr, ctrls) {
    var optionCtrl = ctrls[0];
    var selectCtrl = ctrls[1];
    var node = element[0];

    node.$mdOption = true;

    if (angular.isDefined(attr.ngValue)) {
      scope.$watch(attr.ngValue, changeOptionValue);
    } else if (angular.isDefined(attr.value)) {
      changeOptionValue(attr.value);
    } else {
      throw new Error("Expected either ngValue or value attr");
    }


    var latestHashKey;
    function changeOptionValue(newValue, oldValue) {
      var oldHashKey = selectCtrl.hashGetter(oldValue, scope);
      var newHashKey = selectCtrl.hashGetter(newValue, scope);

      optionCtrl.value = newValue;
      latestHashKey = newHashKey;

      selectCtrl.removeOption(oldHashKey, optionCtrl);
      selectCtrl.addOption(newHashKey, optionCtrl);
    }

    scope.$on('$destroy', function() {
      selectCtrl.removeOption(latestHashKey, optionCtrl);
    });
  }

  function OptionController($scope, $element) {
    this.ripple = $mdInkRipple.attachButtonBehavior($scope, $element);
    this.element = $element;
    this.selected = false;
    this.setSelected = function(isSelected) {
      if (isSelected && !this.selected) {
        this.element.attr('selected', 'selected');
      } else if (!isSelected && this.selected) {
        this.element.removeAttr('selected');
      }
      this.selected = isSelected;
    };
  }

}

function OptgroupDirective() {
}

function SelectProvider($$interimElementProvider) {
  return $$interimElementProvider('$mdSelect')
    .setDefaults({
      methods: ['target'],
      options: selectDefaultOptions
    });

  /* @ngInject */
  function selectDefaultOptions($rootElement, $animate, $mdSelect, $mdConstant, $$rAF, $q, $timeout) {
    return {
      transformTemplate: transformTemplate,
      parent: getParent,
      onShow: onShow,
      onRemove: onRemove,
      themable: true
    };

    function getParent(scope, element, options) {
      if (options.target) {
        var contentParent = angular.element(options.target).controller('mdContent');
        // If no contentParent is found, interimElement will do its default options.parent
        return contentParent && contentParent.$element;
      }
    }

    function transformTemplate(template) {
      return '<div class="md-select-container">' + template + '</div>';
    }

    function onShow(scope, element, options) {
      var selectEl = element.find('md-select');
      var selectNode = selectEl[0];

      if (!options.target) {
        throw new Error("We need a target, man.");
      }
      options.backdrop = angular.element('<md-backdrop>');

      options.parent.append(options.backdrop);
      options.parent.append(element);

      options.backdrop.on('click', function() { 
        scope.$apply($mdSelect.cancel); 
      });
      
      // Give the select two frames to 'initialize' in the DOM, so we can read its
      // height/width/position
      $$rAF(function() {
        $$rAF(animateSelect);
      });

      return transitionEndPromise(selectEl);
      
      function animateSelect() {
        var parentRect = options.parent[0].getBoundingClientRect();
        var maxWidth = parentRect.width - SELECT_EDGE_MARGIN * 2;

        if (selectNode.offsetWidth > maxWidth) {
          selectEl.css('max-width', maxWidth + 'px');
        }

        var isOverflow = selectEl.hasClass('md-overflow');
        var selectRect = selectNode.getBoundingClientRect();
        var targetRect = angular.element(options.target)[0].getBoundingClientRect();
        var selectedOption = selectNode.querySelector('md-option[selected]');
        var spaceAvailable = {
          top: targetRect.top - parentRect.top - SELECT_EDGE_MARGIN,
          left: targetRect.left - parentRect.left - SELECT_EDGE_MARGIN,
          bottom: parentRect.bottom - targetRect.bottom - SELECT_EDGE_MARGIN,
          right: parentRect.right - targetRect.right - SELECT_EDGE_MARGIN
        };
        var left;
        var top;
        var transformOrigin;

        if (selectedOption) {
          var selectedRect = {
            left: selectedOption.offsetLeft,
            top: selectedOption.offsetTop,
            height: selectedOption.offsetHeight,
            width: selectedOption.offsetWidth
          };

          if (isOverflow) {
            var buffer = selectRect.height / 2;
            selectNode.scrollTop = selectedRect.top + selectedRect.height / 2 - buffer;
            if (spaceAvailable.top < buffer) {
              selectNode.scrollTop = Math.min(
                selectedRect.top, 
                selectNode.scrollTop + buffer - spaceAvailable.top 
              );
            } else if (spaceAvailable.bottom < buffer) {
              selectNode.scrollTop = Math.max(
                selectedRect.top - selectRect.height + selectedRect.height,
                selectNode.scrollTop - buffer + spaceAvailable.bottom
              );
            }
          }

          left = targetRect.left + selectedRect.left;
          top = targetRect.top + targetRect.height / 2 - selectedRect.height / 2 -
              selectedRect.top + selectNode.scrollTop;
          transformOrigin = (selectedRect.left + selectedRect.width / 2) + 'px ' +
              (selectedRect.top + selectedRect.height / 2 - selectNode.scrollTop) + 'px';
        } else {
          var firstOption = selectNode.querySelector('md-option');
          var optionRect = optionRect ? {
            left: firstOption.offsetLeft,
            top: firstOption.offsetTop,
            height: firstOption.offsetHeight,
            width: firstOption.offsetWidth
          } : { left: 0, top: 0, height: 0, width: 0 };

          left = targetRect.left + optionRect.left;
          top = targetRect.top + optionRect.top;
        }

        // Make sure it's within the window
        left = Math.min(
          parentRect.right - selectRect.width - SELECT_EDGE_MARGIN, 
          Math.max(left, SELECT_EDGE_MARGIN)
        );
        top = Math.min(
          parentRect.bottom - selectRect.height - SELECT_EDGE_MARGIN, 
          Math.max(top, SELECT_EDGE_MARGIN)
        );

        options.scaleTransform = 'scale(' + 
          Math.min(targetRect.width / selectRect.width, 1.0) + ',' +
          Math.min(targetRect.height / selectRect.height, 1.0) + 
        ')';
        
        selectEl.css({
          left: left + 'px',
          top: top + 'px'
        });
        selectEl.css($mdConstant.CSS.TRANSFORM, options.scaleTransform);
        selectEl.css('transform-origin', transformOrigin);

        $$rAF(function() {
          element.addClass('md-enter');
          selectEl.css($mdConstant.CSS.TRANSFORM, '');
        });

      }
    }

    function onRemove(scope, element, options) {
      element.removeClass('md-enter').addClass('md-leave');

      return transitionEndPromise(element).then(function() {
        element.remove();
        options.backdrop.remove();
      });
    }

    function transitionEndPromise(element) {
      var deferred = $q.defer();
      element.on($mdConstant.CSS.TRANSITIONEND, finished);
      function finished(ev) {
        //Make sure this transitionend didn't bubble up from a child
        if (ev.target === element[0]) {
          element.off($mdConstant.CSS.TRANSITIONEND, finished);
          deferred.resolve();
        }
      }
      return deferred.promise;
    }
  }
}

})();
